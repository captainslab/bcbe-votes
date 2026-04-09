import { fetchCompleteAgendaItem } from "../ingestion/fetchers/simbliAgendaFetcher";
import { fetchSearchMeetingModule } from "../ingestion/fetchers/simbliSearchFetcher";
import {
  normalizeAgendaItemLoaderResponse,
  parseAgendaItemLoaderResponse,
} from "../ingestion/parsers/agendaItemParser";
import { parseSearchMeetingModuleResponse } from "../ingestion/parsers/searchMeetingParser";

const args = process.argv.slice(2);
const readArg = (name: string) => {
  const prefix = `--${name}=`;
  const value = args.find((arg) => arg.startsWith(prefix));
  return value ? value.slice(prefix.length) : undefined;
};

const query = readArg("query") || "board";
const meetingTitle = readArg("meetingTitle") || "Special Board Meeting";
const meetingDatePrefix = readArg("meetingDate") || "2026-04-07";
const remoteDebugPort = Number(readArg("remoteDebugPort") || "9222");

const main = async () => {
  const searchRun = await fetchSearchMeetingModule({ query, remoteDebugPort });
  const searchResponse = parseSearchMeetingModuleResponse(searchRun.searchResponseText);
  const candidateRows = (searchResponse.meetingSearchResponseDTOs ?? [])
    .filter(
      (row) =>
        row.MeetingTitle === meetingTitle &&
        row.MeetingDate.startsWith(meetingDatePrefix) &&
        Boolean(row.AgendaId),
    )
    .map((row) => ({
      meetingId: row.MeetingId,
      enSiteId: row.EnSiteId,
      index: row.Index,
      parentIndex: row.ParentIndex,
      agendaId: row.AgendaId,
      agendaTitle: row.AgendaTitle,
      sourceType: row.SourceType,
      existInAgenda: row.ExistInAgenda,
      existInMinutes: row.ExistInMinutes,
    }));

  const probedNodes = [];

  for (const row of candidateRows) {
    try {
      const fetched = await fetchCompleteAgendaItem({
        agendaId: row.agendaId,
        enSiteId: row.enSiteId,
        remoteDebugPort,
      });
      const parsed = parseAgendaItemLoaderResponse(fetched.text);
      const normalized = normalizeAgendaItemLoaderResponse(parsed);
      const hasBodyContent = normalized.contentBlocks.some((block) => Boolean(block.textPreview));
      const hasAttachments = normalized.attachments.length > 0;
      const hasMinutesVisibility =
        normalized.showMinutes || normalized.canSeeMinutes || normalized.hasMinutesPayload;
      const hasMotionClues = normalized.motionTextCandidates.length > 0;
      const hasVoteClues = normalized.voteClues.length > 0;

      probedNodes.push({
        itemId: row.agendaId,
        parentItemId: normalized.parentAgendaId,
        searchIndex: row.index,
        searchParentIndex: row.parentIndex,
        searchAgendaTitle: row.agendaTitle,
        title: normalized.agendaItemTitle,
        level: normalized.agendaItemLevel,
        sequence: normalized.agendaItemSequence,
        hasBodyContent,
        hasAttachments,
        attachmentCount: normalized.attachments.length,
        hasMinutesVisibility,
        containsMotionClues: hasMotionClues,
        containsVoteClues: hasVoteClues,
        contentBlocks: normalized.contentBlocks,
        normalized,
        rawResponseSample: fetched.text.slice(0, 2000),
      });
    } catch (error) {
      probedNodes.push({
        itemId: row.agendaId,
        parentItemId: null,
        searchIndex: row.index,
        searchParentIndex: row.parentIndex,
        searchAgendaTitle: row.agendaTitle,
        title: row.agendaTitle,
        level: null,
        sequence: null,
        hasBodyContent: false,
        hasAttachments: false,
        attachmentCount: 0,
        hasMinutesVisibility: false,
        containsMotionClues: false,
        containsVoteClues: false,
        contentBlocks: [],
        error: (error as Error).message,
      });
    }
  }

  const firstSubstantiveItem =
    probedNodes.find(
      (node) =>
        node.hasBodyContent ||
        node.hasAttachments ||
        node.hasMinutesVisibility ||
        node.containsMotionClues ||
        node.containsVoteClues,
    ) ?? null;

  console.log(
    JSON.stringify(
      {
        query,
        meetingTitle,
        meetingDatePrefix,
        candidateCount: candidateRows.length,
        candidateNodes: probedNodes.map((node) => ({
          itemId: node.itemId,
          parentItemId: node.parentItemId,
          title: node.title,
          level: node.level,
          sequence: node.sequence,
          hasBodyContent: node.hasBodyContent,
          hasAttachments: node.hasAttachments,
          attachmentCount: node.attachmentCount,
          hasMinutesVisibility: node.hasMinutesVisibility,
          containsMotionClues: node.containsMotionClues,
          containsVoteClues: node.containsVoteClues,
          error: "error" in node ? node.error : undefined,
        })),
        firstSubstantiveItem: firstSubstantiveItem
          ? {
              itemId: firstSubstantiveItem.itemId,
              parentItemId: firstSubstantiveItem.parentItemId,
              title: firstSubstantiveItem.title,
              level: firstSubstantiveItem.level,
              sequence: firstSubstantiveItem.sequence,
              rawResponseSample: firstSubstantiveItem.rawResponseSample,
              normalized: firstSubstantiveItem.normalized,
              fieldsAvailable: {
                itemTitle: Boolean(firstSubstantiveItem.normalized?.agendaItemTitle),
                bodyContent: Boolean(firstSubstantiveItem.hasBodyContent),
                attachments: Boolean(firstSubstantiveItem.hasAttachments),
                minutesVisibility: Boolean(firstSubstantiveItem.hasMinutesVisibility),
                motionText: Boolean(firstSubstantiveItem.normalized?.motionTextCandidates.length),
                voteClues: Boolean(firstSubstantiveItem.normalized?.voteClues.length),
              },
            }
          : null,
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
