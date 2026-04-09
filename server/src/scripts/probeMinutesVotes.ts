import { fetchCompleteAgendaItem } from "../ingestion/fetchers/simbliAgendaFetcher";
import { fetchSearchMeetingModule } from "../ingestion/fetchers/simbliSearchFetcher";
import { parseAgendaItemLoaderResponse } from "../ingestion/parsers/agendaItemParser";
import { extractMinutesVoteSummary } from "../ingestion/parsers/minutesVoteParser";
import { parseSearchMeetingModuleResponse } from "../ingestion/parsers/searchMeetingParser";

const args = process.argv.slice(2);
const readArg = (name: string) => {
  const prefix = `--${name}=`;
  const value = args.find((arg) => arg.startsWith(prefix));
  return value ? value.slice(prefix.length) : undefined;
};

const queries = (readArg("queries") || "carried,no")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const remoteDebugPort = Number(readArg("remoteDebugPort") || "9222");
const maxItems = Number(readArg("maxItems") || "4");

type SampleRow = {
  query: string;
  meetingDate: string;
  meetingTitle: string;
  agendaId: string;
  agendaTitle: string | null;
  enSiteId: string;
  sourceType: string;
  existInMinutes: boolean;
};

const patternDefinitions = [
  { key: "motion-made-by", pattern: /motion made by/i },
  { key: "motion-seconded-by", pattern: /motion seconded by/i },
  { key: "all-voiced-approval", pattern: /all voiced approval/i },
  { key: "motion-carried", pattern: /motion carried/i },
  {
    key: "approved-x-y",
    pattern: /\b(?:approved|passed|carried|adopted|failed|denied)\b[^0-9]{0,24}\d+\s*(?:-|–|to)\s*\d+/i,
  },
  {
    key: "member-specific-yes-no-abstain",
    pattern: /\b(?:ayes?|nays?|abstain(?:ed)?|voted yes|voted no|voted abstain)\b/i,
  },
];

const main = async () => {
  const discoveredRows: SampleRow[] = [];

  for (const query of queries) {
    const searchRun = await fetchSearchMeetingModule({
      query,
      remoteDebugPort,
      timeoutMs: 90_000,
    });
    const parsedSearch = parseSearchMeetingModuleResponse(searchRun.searchResponseText);

    for (const row of parsedSearch.meetingSearchResponseDTOs ?? []) {
      if (!row.ExistInMinutes || !row.AgendaId) continue;
      discoveredRows.push({
        query,
        meetingDate: row.MeetingDate,
        meetingTitle: row.MeetingTitle,
        agendaId: row.AgendaId,
        agendaTitle: row.AgendaTitle,
        enSiteId: row.EnSiteId,
        sourceType: row.SourceType,
        existInMinutes: row.ExistInMinutes,
      });
    }
  }

  const uniqueRows = [...new Map(discoveredRows.map((row) => [row.agendaId, row])).values()].slice(0, maxItems);
  if (uniqueRows.length === 0) {
    throw new Error("No minutes-backed agenda items were discovered for the requested queries");
  }

  const samples = [];
  const recurringPatternCounts = new Map<string, number>();

  for (const row of uniqueRows) {
    const fetched = await fetchCompleteAgendaItem({
      agendaId: row.agendaId,
      enSiteId: row.enSiteId,
      remoteDebugPort,
    });
    const parsedAgendaItem = parseAgendaItemLoaderResponse(fetched.text);
    const extractedVote = extractMinutesVoteSummary(parsedAgendaItem);
    const combinedText = [extractedVote.minutesText ?? "", ...extractedVote.votingLines].join(" ");

    for (const patternDefinition of patternDefinitions) {
      if (!patternDefinition.pattern.test(combinedText)) continue;
      recurringPatternCounts.set(
        patternDefinition.key,
        (recurringPatternCounts.get(patternDefinition.key) ?? 0) + 1,
      );
    }

    samples.push({
      query: row.query,
      meetingDate: row.meetingDate,
      meetingTitle: row.meetingTitle,
      agendaTitle: row.agendaTitle,
      agendaId: row.agendaId,
      sourceType: row.sourceType,
      requestPath: fetched.requestPath,
      rawPayloadSample: {
        MeetingId: parsedAgendaItem.MeetingId,
        Meeting: {
          Title: parsedAgendaItem.Meeting?.Title,
          TitleDateTime: parsedAgendaItem.Meeting?.TitleDateTime,
          IsPublished: parsedAgendaItem.Meeting?.IsPublished,
          IsMinutesPublished: parsedAgendaItem.Meeting?.IsMinutesPublished,
        },
        itemDetails: {
          EncrID: parsedAgendaItem.itemDetails.EncrID,
          EncrParentID: parsedAgendaItem.itemDetails.EncrParentID,
          Title: parsedAgendaItem.itemDetails.Title,
          Sequence: parsedAgendaItem.itemDetails.Sequence,
          Level: parsedAgendaItem.itemDetails.Level,
        },
        Minutes: parsedAgendaItem.Minutes,
        ShowMinutes: parsedAgendaItem.ShowMinutes,
        UserPermission: {
          CanSeeMinutes: parsedAgendaItem.UserPermission.CanSeeMinutes,
        },
      },
      extractedVote,
    });
  }

  console.log(
    JSON.stringify(
      {
        queries,
        discoveredMinutesRows: discoveredRows.length,
        sampledItems: samples.length,
        recurringNarrativePatterns: Object.fromEntries(
          [...recurringPatternCounts.entries()].sort((left, right) => right[1] - left[1]),
        ),
        samples,
      },
      null,
      2,
    ),
  );
};

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
