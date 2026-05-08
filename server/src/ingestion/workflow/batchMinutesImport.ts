import { and, count, eq, inArray, or, sql } from "drizzle-orm";
import { db, schema } from "../../db";
import { logger } from "../../logging/logger";
import { buildPersistedMinutesVoteOutput } from "../../services/minutesVoteService";
import { fetchMeetingMinutesWithFirecrawl, type MeetingTarget } from "../fetchers/simbliFirecrawlMeetingMinutesFetcher";
import {
  flattenMeetingMinutesItems,
  toSyntheticAgendaItemLoaderResponse,
} from "../parsers/meetingMinutesParser";
import { persistImportedMeetingVoteItems } from "./importService";

export type MinutesFailureClass =
  | "failed_browser_blocked"
  | "failed_no_minutes_document"
  | "failed_no_vote_content"
  | "failed_persist"
  | "failed_other";

type BatchMinutesImportOptions = {
  limit?: number;
  simbliIds?: string[];
};

type CountSnapshot = {
  meetingsDiscovered: number;
  meetingsCompleted: number;
  meetingsFailed: number;
  voteItemsPersisted: number;
  voteRecordsPersisted: number;
};

type FailedMeeting = {
  meetingId: number;
  simbliId: string;
  title: string;
  failureClass: MinutesFailureClass;
  reason: string;
};

export type BatchMinutesImportResult = {
  before: CountSnapshot;
  meetingsAttemptedInBatch: number;
  meetingsCompletedInBatch: number;
  meetingsFailedByClass: Record<MinutesFailureClass, number>;
  failedMeetings: FailedMeeting[];
  attemptedMeetings: Array<{
    meetingId: number;
    simbliId: string;
    title: string;
    outcome: "completed" | "failed";
  }>;
  after: CountSnapshot;
  scalableEnoughToBePrimaryHistoricalPullRoute: boolean;
  scalabilityStatement: string;
};

const defaultLimit = 5;

const createFailedByClass = (): Record<MinutesFailureClass, number> => ({
  failed_browser_blocked: 0,
  failed_no_minutes_document: 0,
  failed_no_vote_content: 0,
  failed_persist: 0,
  failed_other: 0,
});

const countMeetingsByStatus = async (
  status: typeof schema.meetings.$inferSelect.ingestionStatus,
) => {
  const [row] = await db
    .select({ count: count() })
    .from(schema.meetings)
    .where(eq(schema.meetings.ingestionStatus, status));
  return row?.count ?? 0;
};

const getSnapshot = async (): Promise<CountSnapshot> => ({
  meetingsDiscovered: (await db.select({ count: count() }).from(schema.meetings))[0]?.count ?? 0,
  meetingsCompleted: await countMeetingsByStatus("completed"),
  meetingsFailed: await countMeetingsByStatus("failed"),
  voteItemsPersisted: (await db.select({ count: count() }).from(schema.voteItems))[0]?.count ?? 0,
  voteRecordsPersisted: (await db.select({ count: count() }).from(schema.voteRecords))[0]?.count ?? 0,
});

const classifyFailure = (error: unknown): { failureClass: MinutesFailureClass; reason: string } => {
  const reason = error instanceof Error ? error.message : String(error);

  if (/Incapsula|hydration tokens|GetMeetingMinutes returned|Firecrawl scrape failed/i.test(reason)) {
    return { failureClass: "failed_browser_blocked", reason };
  }

  if (/did not return item minutes/i.test(reason)) {
    return { failureClass: "failed_no_minutes_document", reason };
  }

  if (/did not produce vote-bearing items/i.test(reason)) {
    return { failureClass: "failed_no_vote_content", reason };
  }

  if (/persist/i.test(reason)) {
    return { failureClass: "failed_persist", reason };
  }

  return { failureClass: "failed_other", reason };
};

const toScalabilityStatement = (
  attempted: number,
  completed: number,
  failedByClass: Record<MinutesFailureClass, number>,
) => {
  if (attempted === 0) {
    return "No failed meetings were attempted.";
  }

  if (completed >= Math.ceil(attempted / 2)) {
    return "Firecrawl minutes import succeeded on the majority of attempted meetings.";
  }

  if (completed > 0) {
    return "Firecrawl minutes import succeeded on some meetings but not the majority.";
  }

  if (failedByClass.failed_browser_blocked === attempted) {
    return "All meetings failed at the browser/hydration stage — Simbli may be blocking the Firecrawl IP range.";
  }

  return "Firecrawl minutes import did not complete enough meetings in this batch.";
};

const normalizeMotionText = (motionText?: string | null) =>
  motionText ? motionText.replace(/^to\s+/i, "").trim() : undefined;

const toParsedVoteItem = (
  output: ReturnType<typeof buildPersistedMinutesVoteOutput>,
  sourceUrl: string,
) => {
  const normalizedMotionText = normalizeMotionText(output.voteItem.motionText);

  return {
    itemTitle: output.voteItem.itemTitle,
    summarySource: sourceUrl,
    summaryConfidenceScore: output.voteItem.summaryConfidenceScore,
    motionText: normalizedMotionText ?? output.voteItem.itemTitle,
    isNonUnanimous: output.voteItem.isNonUnanimous,
    voteTally: output.voteItem.voteTally,
    verificationStatus: output.voteItem.verificationStatus,
    votes: output.voteRecords.map((vote) => ({
      memberName: vote.memberName,
      value: vote.voteValue,
    })),
    ...(output.voteItem.agendaSection ? { agendaSection: output.voteItem.agendaSection } : {}),
    ...(output.voteItem.summaryText ? { summaryText: output.voteItem.summaryText } : {}),
    ...(output.voteItem.motionMadeBy ? { motionMadeBy: output.voteItem.motionMadeBy } : {}),
    ...(output.voteItem.motionSecondedBy
      ? { motionSecondedBy: output.voteItem.motionSecondedBy }
      : {}),
    ...(output.voteItem.result ? { result: output.voteItem.result } : {}),
    ...(output.voteItem.sourceExcerpt ? { sourceExcerpt: output.voteItem.sourceExcerpt } : {}),
    ...(output.voteItem.detectedPattern ? { detectedPattern: output.voteItem.detectedPattern } : {}),
    ...(output.voteItem.confidenceScore !== undefined
      ? { confidenceScore: output.voteItem.confidenceScore }
      : {}),
  };
};

const hasVoteData = (output: ReturnType<typeof buildPersistedMinutesVoteOutput>) =>
  output.voteRecords.length > 0 ||
  Object.values(output.voteItem.voteTally).some((value) => value > 0) ||
  output.voteItem.detectedPattern !== "minutes_no_vote_evidence";

const buildItemSourceUrl = (
  minutesRequestUrl: string,
  agendaId: string,
  minutesTabUrl: string,
) => `${minutesTabUrl}&enIID=${encodeURIComponent(agendaId)}#source=${encodeURIComponent(minutesRequestUrl)}`;

const buildMeetingTargets = async (
  options: BatchMinutesImportOptions,
): Promise<MeetingTarget[]> => {
  const limit = options.limit ?? defaultLimit;

  // When specific simbliIds are requested, fetch them regardless of ingestion status so we
  // can re-run minutes import on completed meetings that still have unverified vote items.
  const meetings = await db.query.meetings.findMany({
    where:
      options.simbliIds && options.simbliIds.length
        ? inArray(schema.meetings.simbliId, options.simbliIds)
        : or(eq(schema.meetings.ingestionStatus, "failed"), eq(schema.meetings.ingestionStatus, "partial")),
    with: {
      voteItems: {
        columns: {
          id: true,
          verificationStatus: true,
        },
      },
    },
    orderBy: (meeting, { asc }) => [asc(meeting.date)],
  });

  // Eligible: no vote items yet, or has at least one unverified item that minutes can upgrade.
  const eligibleMeetings = meetings.filter(
    (meeting) =>
      meeting.voteItems.length === 0 ||
      meeting.voteItems.some((vi) => vi.verificationStatus === "unverified"),
  );

  const orderedMeetings =
    options.simbliIds && options.simbliIds.length
      ? options.simbliIds
          .map((simbliId) => eligibleMeetings.find((meeting) => meeting.simbliId === simbliId))
          .filter((meeting): meeting is typeof meetings[number] => Boolean(meeting))
      : eligibleMeetings.slice(0, limit);

  return orderedMeetings.map((meeting) => ({
    meetingId: meeting.id,
    simbliId: meeting.simbliId,
    title: meeting.title,
    date: meeting.date.toISOString(),
    type: meeting.type,
    sourceUrl: meeting.sourceUrl,
    siteId: meeting.simbliSiteId,
  }));
};

export const runBatchMinutesImport = async (
  options: BatchMinutesImportOptions = {},
): Promise<BatchMinutesImportResult> => {
  const before = await getSnapshot();
  const meetingsFailedByClass = createFailedByClass();
  const failedMeetings: FailedMeeting[] = [];
  const attemptedMeetings: BatchMinutesImportResult["attemptedMeetings"] = [];

  const targetMeetings = await buildMeetingTargets(options);
  const fetchResult = await fetchMeetingMinutesWithFirecrawl(targetMeetings);

  let meetingsCompletedInBatch = 0;

  for (const failure of fetchResult.failures) {
    const { failureClass, reason } = classifyFailure(failure.reason);
    meetingsFailedByClass[failureClass] += 1;
    failedMeetings.push({
      meetingId: failure.meeting.meetingId,
      simbliId: failure.meeting.simbliId,
      title: failure.meeting.title,
      failureClass,
      reason,
    });
    attemptedMeetings.push({
      meetingId: failure.meeting.meetingId,
      simbliId: failure.meeting.simbliId,
      title: failure.meeting.title,
      outcome: "failed",
    });
  }

  for (const success of fetchResult.successes) {
    try {
      const flattened = flattenMeetingMinutesItems(success.response);
      if (flattened.length === 0) {
        throw new Error(
          `Firecrawl minutes import did not return item minutes for meeting ${success.meeting.simbliId}`,
        );
      }

      const voteItems = flattened
        .map((item) => ({
          item,
          syntheticResponse: toSyntheticAgendaItemLoaderResponse(
            {
              simbliId: success.meeting.simbliId,
              title: success.meeting.title,
              date: success.meeting.date,
              ...(success.meeting.siteId ? { siteId: success.meeting.siteId } : {}),
            },
            item,
          ),
        }))
        .map(({ item, syntheticResponse }) => ({
          item,
          output: buildPersistedMinutesVoteOutput(syntheticResponse),
        }))
        .filter(({ output }) => hasVoteData(output))
        .map(({ item, output }) =>
          toParsedVoteItem(
            output,
            buildItemSourceUrl(success.minutesRequestUrl, item.agendaId, success.minutesTabUrl),
          ),
        );

      if (voteItems.length === 0) {
        throw new Error(
          `Firecrawl minutes import did not produce vote-bearing items for meeting ${success.meeting.simbliId}`,
        );
      }

      await persistImportedMeetingVoteItems({
        meeting: {
          simbliId: success.meeting.simbliId,
          date: success.meeting.date,
          title: success.meeting.title,
          type: success.meeting.type,
          sourceUrl: success.meeting.sourceUrl,
          minutesUrl: success.minutesTabUrl,
        },
        voteItems,
      });

      // Promote any agenda-sourced items that couldn't be matched by the minutes import.
      // They've now been through the pipeline; "unverified" → "needs_review" is more accurate.
      await db
        .update(schema.voteItems)
        .set({
          verificationStatus: "needs_review",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.voteItems.meetingId, success.meeting.meetingId),
            sql`${schema.voteItems.verificationStatus} = 'unverified'`,
          ),
        );

      meetingsCompletedInBatch += 1;
      attemptedMeetings.push({
        meetingId: success.meeting.meetingId,
        simbliId: success.meeting.simbliId,
        title: success.meeting.title,
        outcome: "completed",
      });
    } catch (error) {
      const { failureClass, reason } = classifyFailure(error);
      meetingsFailedByClass[failureClass] += 1;
      failedMeetings.push({
        meetingId: success.meeting.meetingId,
        simbliId: success.meeting.simbliId,
        title: success.meeting.title,
        failureClass,
        reason,
      });
      attemptedMeetings.push({
        meetingId: success.meeting.meetingId,
        simbliId: success.meeting.simbliId,
        title: success.meeting.title,
        outcome: "failed",
      });
      logger.warn(
        { meetingId: success.meeting.meetingId, simbliId: success.meeting.simbliId, err: error },
        "Firecrawl minutes batch import failed",
      );
    }
  }

  const after = await getSnapshot();
  const scalabilityStatement = toScalabilityStatement(
    targetMeetings.length,
    meetingsCompletedInBatch,
    meetingsFailedByClass,
  );

  return {
    before,
    meetingsAttemptedInBatch: targetMeetings.length,
    meetingsCompletedInBatch,
    meetingsFailedByClass,
    failedMeetings,
    attemptedMeetings,
    after,
    scalableEnoughToBePrimaryHistoricalPullRoute:
      meetingsCompletedInBatch >= Math.ceil(Math.max(targetMeetings.length, 1) / 2),
    scalabilityStatement,
  };
};
