import { eq } from "drizzle-orm";
import { db, schema } from "../../db";
import { fetchMeetingListing } from "../fetchers/simbliFetcher";
import {
  normalizeMeetingListingRows,
  type NormalizedMeetingListingRow,
} from "../normalizers/meetingListingNormalizer";
import { parseMeetingListing } from "../parsers/meetingListingParser";
import { logger } from "../../logging/logger";

export type MeetingListingImportOptions = {
  startMid?: number;
  endMid?: number;
};

export type MeetingListingImportResult = {
  extractedCount: number;
  normalizedCount: number;
  savedCount: number;
  failedCount: number;
  failures: { rowIndex?: number; simbliId?: string; reason: string }[];
  meetings: NormalizedMeetingListingRow[];
};

const createImportLog = async (type: string) => {
  const [log] = await db.insert(schema.importLogs).values({ type }).returning();
  if (!log) throw new Error("Failed to create import log");
  return log;
};

const completeImportLog = async (
  id: number,
  updates: Partial<Pick<
    typeof schema.importLogs.$inferSelect,
    "completedAt" | "meetingsProcessed" | "votesCreated" | "recordsFlagged" | "errorSummary"
  >>,
) => {
  await db
    .update(schema.importLogs)
    .set({ completedAt: new Date(), ...updates })
    .where(eq(schema.importLogs.id, id));
};

const upsertMeeting = async (meeting: NormalizedMeetingListingRow) => {
  const [saved] = await db
    .insert(schema.meetings)
    .values({
      simbliSiteId: meeting.simbliSiteId,
      simbliId: meeting.simbliId,
      date: new Date(meeting.date),
      title: meeting.title,
      type: meeting.type,
      sourceUrl: meeting.sourceUrl,
      minutesUrl: meeting.minutesUrl,
      ingestionStatus: "partial",
      verificationStatus: "unverified",
    })
    .onConflictDoUpdate({
      target: schema.meetings.simbliId,
      set: {
        simbliSiteId: meeting.simbliSiteId,
        date: new Date(meeting.date),
        title: meeting.title,
        type: meeting.type,
        sourceUrl: meeting.sourceUrl,
        minutesUrl: meeting.minutesUrl,
        ingestionStatus: "partial",
        verificationStatus: "unverified",
        updatedAt: new Date(),
      },
    })
    .returning();

  if (!saved) throw new Error(`Failed to persist meeting ${meeting.simbliId}`);
  return saved;
};

export const importMeetingListing = async (
  options: MeetingListingImportOptions = {},
): Promise<MeetingListingImportResult> => {
  const log = await createImportLog("meeting-listing");

  try {
    const html = await fetchMeetingListing();
    const parsed = parseMeetingListing(html);
    const filtered = parsed.filter((row) => {
      const mid = Number(row.simbliId);
      if (Number.isNaN(mid)) return false;
      if (options.startMid && mid < options.startMid) return false;
      if (options.endMid && mid > options.endMid) return false;
      return true;
    });

    const normalized = normalizeMeetingListingRows(filtered);
    const failures: MeetingListingImportResult["failures"] = [...normalized.errors];
    const savedMeetings: NormalizedMeetingListingRow[] = [];

    for (const meeting of normalized.meetings) {
      try {
        await upsertMeeting(meeting);
        savedMeetings.push(meeting);
      } catch (err) {
        logger.warn({ err, simbliId: meeting.simbliId }, "Failed to persist meeting");
        failures.push({
          simbliId: meeting.simbliId,
          reason: (err as Error).message,
        });
      }
    }

    const completionUpdates: Partial<Pick<
      typeof schema.importLogs.$inferSelect,
      "completedAt" | "meetingsProcessed" | "votesCreated" | "recordsFlagged" | "errorSummary"
    >> = {
      meetingsProcessed: savedMeetings.length,
      votesCreated: 0,
      recordsFlagged: failures.length,
    };
    if (failures.length) {
      completionUpdates.errorSummary = JSON.stringify({ failures });
    }
    await completeImportLog(log.id, completionUpdates);

    return {
      extractedCount: parsed.length,
      normalizedCount: normalized.meetings.length,
      savedCount: savedMeetings.length,
      failedCount: failures.length,
      failures,
      meetings: savedMeetings,
    };
  } catch (err) {
    await completeImportLog(log.id, {
      errorSummary: (err as Error).message,
    });
    throw err;
  }
};
