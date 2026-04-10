import { count, eq } from "drizzle-orm";
import { db, schema } from "../../db";
import { logger } from "../../logging/logger";
import { fetchMeetingDetail } from "../fetchers/simbliFetcher";
import { parseMeetingDetailPage } from "../parsers/meetingDetailParser";
import { importMeetingById, NoVoteContentError } from "./importService";

export type MeetingFailureClass =
  | "failed_session_gated"
  | "failed_no_vote_content"
  | "failed_parse"
  | "failed_other";

type BatchDetailImportOptions = {
  startMid?: number;
  endMid?: number;
};

type CountSnapshot = {
  meetingsDiscovered: number;
  meetingsCompleted: number;
  meetingsFailed: number;
  meetingsPartial: number;
  voteItemsPersisted: number;
  voteRecordsPersisted: number;
};

type FailedMeeting = {
  meetingId: number;
  simbliId: string;
  title: string;
  failureClass: MeetingFailureClass;
  reason: string;
};

export type BatchDetailImportResult = {
  before: CountSnapshot;
  meetingsProcessed: number;
  meetingsCompletedInBatch: number;
  meetingsFailedByClass: Record<MeetingFailureClass, number>;
  failedMeetings: FailedMeeting[];
  fallbackUsed: false;
  fallbackSkippedReason: string;
  after: CountSnapshot;
  dashboardCanSwitchToHistoricalCoverage: boolean;
};

const fallbackSkippedReason =
  "Current minutes/search-backed proof path is not a meeting-targeted terminal persistence workflow, so blocked meetings are classified instead of being fake-completed.";

const createFailedByClass = (): Record<MeetingFailureClass, number> => ({
  failed_session_gated: 0,
  failed_no_vote_content: 0,
  failed_parse: 0,
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
  meetingsDiscovered: (
    await db.select({ count: count() }).from(schema.meetings)
  )[0]?.count ?? 0,
  meetingsCompleted: await countMeetingsByStatus("completed"),
  meetingsFailed: await countMeetingsByStatus("failed"),
  meetingsPartial: await countMeetingsByStatus("partial"),
  voteItemsPersisted: (
    await db.select({ count: count() }).from(schema.voteItems)
  )[0]?.count ?? 0,
  voteRecordsPersisted: (
    await db.select({ count: count() }).from(schema.voteRecords)
  )[0]?.count ?? 0,
});

const classifyNoVoteContent = async (simbliId: string): Promise<MeetingFailureClass> => {
  try {
    const { html, sourceUrl } = await fetchMeetingDetail(simbliId);
    const parsed = parseMeetingDetailPage(html, sourceUrl, simbliId);
    const blockText = parsed.sourceBlocks.map((block) => block.text).join(" ");

    if (parsed.status === "shell-only" || /Pardon Our Interruption/i.test(blockText)) {
      return "failed_session_gated";
    }

    return "failed_no_vote_content";
  } catch {
    return "failed_other";
  }
};

const classifyFailure = async (
  simbliId: string,
  error: unknown,
): Promise<{ failureClass: MeetingFailureClass; reason: string }> => {
  const reason = error instanceof Error ? error.message : String(error);

  if (error instanceof NoVoteContentError) {
    return {
      failureClass: await classifyNoVoteContent(simbliId),
      reason,
    };
  }

  if (/Pardon Our Interruption|app-viewmeeting|shell-only/i.test(reason)) {
    return { failureClass: "failed_session_gated", reason };
  }

  if (/parse|invalid|unexpected/i.test(reason)) {
    return { failureClass: "failed_parse", reason };
  }

  return { failureClass: "failed_other", reason };
};

const markMeetingFailed = async (meetingId: number) => {
  await db
    .update(schema.meetings)
    .set({
      ingestionStatus: "failed",
      verificationStatus: "flagged",
      updatedAt: new Date(),
    })
    .where(eq(schema.meetings.id, meetingId));
};

export const runBatchDetailImport = async (
  options: BatchDetailImportOptions = {},
): Promise<BatchDetailImportResult> => {
  const before = await getSnapshot();
  const failedMeetings: FailedMeeting[] = [];
  const meetingsFailedByClass = createFailedByClass();

  const partialMeetings = await db.query.meetings.findMany({
    where: eq(schema.meetings.ingestionStatus, "partial"),
    orderBy: (meeting, { asc }) => [asc(meeting.date)],
  });

  const filteredMeetings = partialMeetings.filter((meeting) => {
    const mid = Number(meeting.simbliId);
    if (Number.isNaN(mid)) return false;
    if (options.startMid !== undefined && mid < options.startMid) return false;
    if (options.endMid !== undefined && mid > options.endMid) return false;
    return true;
  });

  let meetingsCompletedInBatch = 0;

  for (const meeting of filteredMeetings) {
    try {
      await importMeetingById(meeting.simbliId);
      meetingsCompletedInBatch += 1;
    } catch (error) {
      const { failureClass, reason } = await classifyFailure(meeting.simbliId, error);
      meetingsFailedByClass[failureClass] += 1;
      failedMeetings.push({
        meetingId: meeting.id,
        simbliId: meeting.simbliId,
        title: meeting.title,
        failureClass,
        reason,
      });
      await markMeetingFailed(meeting.id);
      logger.warn({ meetingId: meeting.id, simbliId: meeting.simbliId, failureClass, err: error }, "Batch detail import failed");
    }
  }

  const after = await getSnapshot();

  return {
    before,
    meetingsProcessed: filteredMeetings.length,
    meetingsCompletedInBatch,
    meetingsFailedByClass,
    failedMeetings,
    fallbackUsed: false,
    fallbackSkippedReason,
    after,
    dashboardCanSwitchToHistoricalCoverage:
      after.meetingsDiscovered > 0 &&
      after.meetingsCompleted === after.meetingsDiscovered &&
      after.meetingsFailed === 0,
  };
};
