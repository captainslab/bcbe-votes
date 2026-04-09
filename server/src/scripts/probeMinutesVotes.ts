import { fetchCompleteAgendaItem } from "../ingestion/fetchers/simbliAgendaFetcher";
import { fetchSearchMeetingModule } from "../ingestion/fetchers/simbliSearchFetcher";
import { parseAgendaItemLoaderResponse } from "../ingestion/parsers/agendaItemParser";
import { parseSearchMeetingModuleResponse } from "../ingestion/parsers/searchMeetingParser";
import {
  buildPersistedMinutesVoteOutput,
  type PersistedMinutesVoteOutput,
} from "../services/minutesVoteService";

const args = process.argv.slice(2);
const readArg = (name: string) => {
  const prefix = `--${name}=`;
  const value = args.find((arg) => arg.startsWith(prefix));
  return value ? value.slice(prefix.length) : undefined;
};

const queries = (readArg("queries") || "no,unanimous,approved,ayes,abstain")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const remoteDebugPort = Number(readArg("remoteDebugPort") || "9222");
const maxItems = Number(readArg("maxItems") || "18");

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

type ProofCaseName = "mixed" | "unanimous" | "abstainOrTally";

type ProofCase = ReturnType<typeof toProofCase>;

type ProbedSample = {
  query: string;
  meetingDate: string;
  meetingTitle: string;
  agendaTitle: string | null;
  agendaId: string;
  sourceType: string;
  requestPath: string;
  structured: PersistedMinutesVoteOutput;
};

const classifySample = (sample: ProbedSample): ProofCaseName[] => {
  const voteValues = sample.structured.voteRecords.map((vote) => vote.voteValue);
  const hasNo = voteValues.includes("no");
  const hasAbstain = voteValues.includes("abstain");
  const tally = sample.structured.voteItem.voteTally;
  const tallyHasSplit = tally.no > 0 || tally.abstain > 0;

  const classifications: ProofCaseName[] = [];
  if (hasNo || sample.structured.voteItem.voteShape === "mixed") {
    classifications.push("mixed");
  }
  if (
    sample.structured.voteItem.voteShape === "unanimous" &&
    !hasNo &&
    !hasAbstain &&
    (!sample.structured.voteRecords.length ||
      sample.structured.voteRecords.every((vote) => vote.voteValue === "yes"))
  ) {
    classifications.push("unanimous");
  }
  if (hasAbstain || sample.structured.extraction.tally || tallyHasSplit) {
    classifications.push("abstainOrTally");
  }
  return classifications;
};

const toProofCase = (sample: ProbedSample) => ({
  meetingDate: sample.meetingDate,
  meetingTitle: sample.meetingTitle,
  agendaTitle: sample.agendaTitle,
  agendaId: sample.agendaId,
  query: sample.query,
  sourceType: sample.sourceType,
  requestPath: sample.requestPath,
  rawSourceEvidence: sample.structured.rawSourceEvidence,
  voteItem: sample.structured.voteItem,
  voteRecords: sample.structured.voteRecords,
  failureReasons: sample.structured.failureReasons,
});

const scoreProofCase = (proofCase: ProofCase) =>
  proofCase.voteRecords.length * 25 +
  proofCase.voteItem.confidenceScore * 100 -
  proofCase.failureReasons.length * 30;

const shouldReplaceProofCase = (
  currentCase: ProofCase | undefined,
  nextCase: ProofCase,
  classification: ProofCaseName,
  currentSelections: Partial<Record<ProofCaseName, ProofCase>>,
) => {
  if (!currentCase) return true;

  const nextScore = scoreProofCase(nextCase);
  const currentScore = scoreProofCase(currentCase);
  if (nextScore !== currentScore) return nextScore > currentScore;

  if (
    classification === "abstainOrTally" &&
    currentSelections.mixed &&
    nextCase.agendaId !== currentSelections.mixed.agendaId &&
    currentCase.agendaId === currentSelections.mixed.agendaId
  ) {
    return true;
  }

  return false;
};

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

  const uniqueRows = [...new Map(discoveredRows.map((row) => [row.agendaId, row])).values()].slice(
    0,
    maxItems,
  );
  if (uniqueRows.length === 0) {
    throw new Error("No minutes-backed agenda items were discovered for the requested queries");
  }

  const proofCases: Partial<Record<ProofCaseName, ProofCase>> = {};
  const scannedSamples: ProofCase[] = [];
  const remainingFailures = new Map<string, number>();

  for (const row of uniqueRows) {
    const fetched = await fetchCompleteAgendaItem({
      agendaId: row.agendaId,
      enSiteId: row.enSiteId,
      remoteDebugPort,
    });
    const parsedAgendaItem = parseAgendaItemLoaderResponse(fetched.text);
    const structured = buildPersistedMinutesVoteOutput(parsedAgendaItem);
    const sample: ProbedSample = {
      query: row.query,
      meetingDate: row.meetingDate,
      meetingTitle: row.meetingTitle,
      agendaTitle: row.agendaTitle,
      agendaId: row.agendaId,
      sourceType: row.sourceType,
      requestPath: fetched.requestPath,
      structured,
    };

    const proofSample = toProofCase(sample);
    scannedSamples.push(proofSample);
    sample.structured.failureReasons.forEach((failure) => {
      remainingFailures.set(failure, (remainingFailures.get(failure) ?? 0) + 1);
    });

    classifySample(sample).forEach((classification) => {
      if (shouldReplaceProofCase(proofCases[classification], proofSample, classification, proofCases)) {
        proofCases[classification] = proofSample;
      }
    });
  }

  const missingCases = (["mixed", "unanimous", "abstainOrTally"] as ProofCaseName[]).filter(
    (caseName) => !proofCases[caseName],
  );

  console.log(
    JSON.stringify(
      {
        queries,
        discoveredMinutesRows: discoveredRows.length,
        scannedUniqueAgendaItems: uniqueRows.length,
        proofCases,
        missingCases,
        remainingFailures: [...remainingFailures.entries()]
          .sort((left, right) => right[1] - left[1])
          .map(([failure, count]) => ({ failure, count })),
        scannedSamples,
      },
      null,
      2,
    ),
  );

  if (missingCases.length > 0) {
    process.exitCode = 1;
  }
};

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
