import { eq } from "drizzle-orm";
import { db, schema } from "../../db";
import { logger } from "../../logging/logger";
import { fetchSimbliSearchFlow } from "../fetchers/simbliSearchFetcher";
import {
  parseSearchMeetingModuleResponse,
  parseSearchedMeetingDataResponse,
} from "../parsers/searchMeetingParser";
import {
  normalizeSearchMeetingRows,
  normalizeSearchedMeetingData,
  type NormalizedSearchedMeetingRow,
  type NormalizedSearchMeetingRow,
} from "../normalizers/searchMeetingNormalizer";

export type SearchMeetingImportOptions = {
  query?: string;
  remoteDebugPort?: number;
};

export type SearchMeetingImportResult = {
  searchResultsExtracted: number;
  searchResultsNormalized: number;
  meetingsExtracted: number;
  meetingsNormalized: number;
  savedCount: number;
  failedCount: number;
  failures: { rowIndex?: number; simbliId?: string; reason: string }[];
  searchSample: NormalizedSearchMeetingRow[];
  meetingSample: NormalizedSearchedMeetingRow[];
  selectedAgendaId: string;
  cacheKey: string;
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

const upsertMeeting = async (meeting: NormalizedSearchedMeetingRow) => {
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
        ingestionStatus: "partial",
        verificationStatus: "unverified",
        updatedAt: new Date(),
      },
    })
    .returning();

  if (!saved) throw new Error(`Failed to persist meeting ${meeting.simbliId}`);
  return saved;
};

export const importSearchMeetings = async (
  options: SearchMeetingImportOptions = {},
): Promise<SearchMeetingImportResult> => {
  const log = await createImportLog("meeting-search");

  try {
    const browserRun = await fetchSimbliSearchFlow(options);
    const searchResponse = parseSearchMeetingModuleResponse(browserRun.searchResponseText);
    const searchedMeetingData = parseSearchedMeetingDataResponse(browserRun.searchedMeetingDataText);
    const searchRows = searchResponse.meetingSearchResponseDTOs ?? [];
    const normalizedSearch = normalizeSearchMeetingRows(searchRows);
    const normalizedMeetings = normalizeSearchedMeetingData(searchedMeetingData);
    const failures = [...normalizedSearch.errors, ...normalizedMeetings.errors];

    const searchRequestBody = JSON.parse(browserRun.searchRequestBody) as {
      CacheKey?: string;
      SearchText?: string;
    };

    let savedCount = 0;
    for (const meeting of normalizedMeetings.meetings) {
      try {
        await upsertMeeting(meeting);
        savedCount += 1;
      } catch (err) {
        logger.warn({ err, simbliId: meeting.simbliId }, "Failed to persist searched meeting");
        failures.push({
          simbliId: meeting.simbliId,
          reason: (err as Error).message,
        });
      }
    }

    const selectedAgendaId =
      searchRows.find((row) => row.AgendaId && row.AgendaTitle === "Board View")
        ?.AgendaId ??
      searchRows.find((row) => row.AgendaId)?.AgendaId ??
      "";

    const cacheKey = searchRequestBody.CacheKey ?? "";
    const completionUpdates: Partial<Pick<
      typeof schema.importLogs.$inferSelect,
      "completedAt" | "meetingsProcessed" | "votesCreated" | "recordsFlagged" | "errorSummary"
    >> = {
      meetingsProcessed: savedCount,
      votesCreated: 0,
      recordsFlagged: failures.length,
    };
    if (failures.length) {
      completionUpdates.errorSummary = JSON.stringify({ failures });
    }
    await completeImportLog(log.id, {
      ...completionUpdates,
    });

    return {
      searchResultsExtracted: searchRows.length,
      searchResultsNormalized: normalizedSearch.meetings.length,
      meetingsExtracted: searchedMeetingData.MeetingList.length,
      meetingsNormalized: normalizedMeetings.meetings.length,
      savedCount,
      failedCount: failures.length,
      failures,
      searchSample: normalizedSearch.meetings.slice(0, 5),
      meetingSample: normalizedMeetings.meetings.slice(0, 5),
      selectedAgendaId,
      cacheKey,
    };
  } catch (err) {
    await completeImportLog(log.id, {
      errorSummary: (err as Error).message,
    });
    throw err;
  }
};
