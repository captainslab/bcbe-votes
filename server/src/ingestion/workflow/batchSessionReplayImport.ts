import { count, desc, eq } from "drizzle-orm";
import { db, schema } from "../../db";
import { logger } from "../../logging/logger";
import {
  importMeetingById,
  NoSearchReplayMatchError,
  NoSearchReplayVoteContentError,
  NoVoteContentError,
} from "./importService";

export type SessionReplayFailureClass =
  | "failed_no_search_hits"
  | "failed_no_vote_content"
  | "failed_replay"
  | "failed_other";

type BatchSessionReplayImportOptions = {
  limit?: number;
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
  failureClass: SessionReplayFailureClass;
  reason: string;
};

export type BatchSessionReplayImportResult = {
  before: CountSnapshot;
  meetingsAttemptedInBatch: number;
  meetingsCompletedInBatch: number;
  meetingsFailedByClass: Record<SessionReplayFailureClass, number>;
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

const defaultLimit = 10;

const createFailedByClass = (): Record<SessionReplayFailureClass, number> => ({
  failed_no_search_hits: 0,
  failed_no_vote_content: 0,
  failed_replay: 0,
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

const classifyFailure = (
  error: unknown,
): { failureClass: SessionReplayFailureClass; reason: string } => {
  const reason = error instanceof Error ? error.message : String(error);

  if (error instanceof NoSearchReplayMatchError) {
    return { failureClass: "failed_no_search_hits", reason };
  }

  if (error instanceof NoSearchReplayVoteContentError || error instanceof NoVoteContentError) {
    return { failureClass: "failed_no_vote_content", reason };
  }

  if (/chrome|cdp|debugger|websocket|SearchMeetingModule|GetCompleteAgendaItem|timed out|timeout/i.test(reason)) {
    return { failureClass: "failed_replay", reason };
  }

  return { failureClass: "failed_other", reason };
};

const toScalabilityStatement = (
  attempted: number,
  completed: number,
  failedByClass: Record<SessionReplayFailureClass, number>,
) => {
  if (attempted === 0) {
    return "No failed meetings were attempted in this batch, so the path remains unproven operationally.";
  }

  if (completed >= Math.ceil(attempted / 2)) {
    return "This path looks operationally scalable enough to continue as the primary historical pull route for search-indexed meetings, with failure handling still required for non-indexed or non-vote-bearing meetings.";
  }

  if (completed > 0) {
    return "This path is operationally useful but not yet scalable enough to declare as the primary historical pull route across the remaining failed meetings without additional batching, caching, or coverage improvements.";
  }

  if (failedByClass.failed_no_search_hits === attempted) {
    return "This path did not scale across the attempted slice because none of the targeted failed meetings had usable search replay hits.";
  }

  return "This path is not yet scalable enough to become the primary historical pull route for the remaining failed meetings based on this batch proof.";
};

export const runBatchSessionReplayImport = async (
  options: BatchSessionReplayImportOptions = {},
): Promise<BatchSessionReplayImportResult> => {
  const before = await getSnapshot();
  const limit = options.limit ?? defaultLimit;
  const meetingsFailedByClass = createFailedByClass();
  const failedMeetings: FailedMeeting[] = [];
  const attemptedMeetings: BatchSessionReplayImportResult["attemptedMeetings"] = [];

  const targetMeetings = await db.query.meetings.findMany({
    where: eq(schema.meetings.ingestionStatus, "failed"),
    orderBy: (meeting, { desc: orderDesc }) => [orderDesc(meeting.date)],
    limit,
  });

  let meetingsCompletedInBatch = 0;

  for (const meeting of targetMeetings) {
    try {
      await importMeetingById(meeting.simbliId);
      meetingsCompletedInBatch += 1;
      attemptedMeetings.push({
        meetingId: meeting.id,
        simbliId: meeting.simbliId,
        title: meeting.title,
        outcome: "completed",
      });
    } catch (error) {
      const { failureClass, reason } = classifyFailure(error);
      meetingsFailedByClass[failureClass] += 1;
      failedMeetings.push({
        meetingId: meeting.id,
        simbliId: meeting.simbliId,
        title: meeting.title,
        failureClass,
        reason,
      });
      attemptedMeetings.push({
        meetingId: meeting.id,
        simbliId: meeting.simbliId,
        title: meeting.title,
        outcome: "failed",
      });
      logger.warn(
        { meetingId: meeting.id, simbliId: meeting.simbliId, failureClass, err: error },
        "Batch session replay import failed",
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
