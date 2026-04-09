import { eq } from "drizzle-orm";
import { db, schema } from "../../db";
import { fetchMeetingDetail } from "../fetchers/simbliFetcher";
import { logger } from "../../logging/logger";
import { parseMeetingDetailPage } from "../parsers/meetingDetailParser";

export type MeetingDetailImportOptions = {
  simbliId: string;
};

export type MeetingDetailImportResult = ReturnType<typeof parseMeetingDetailPage>;

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

const summarizeStatus = (result: MeetingDetailImportResult) =>
  result.sourceBlocks.map((block) => ({
    kind: block.kind,
    label: block.label,
    text: block.text,
    href: block.href ?? null,
    optionCount: block.options?.length ?? 0,
  }));

export const importMeetingDetail = async (
  options: MeetingDetailImportOptions,
): Promise<MeetingDetailImportResult> => {
  const log = await createImportLog("meeting-detail");

  try {
    const { html, sourceUrl } = await fetchMeetingDetail(options.simbliId);
    const parsed = parseMeetingDetailPage(html, sourceUrl, options.simbliId);

    // TODO: once the JS-backed meeting data source is identified, persist the agenda/vote payload.
    await completeImportLog(log.id, {
      meetingsProcessed: 1,
      votesCreated: 0,
      recordsFlagged: 0,
      errorSummary: JSON.stringify({
        status: parsed.status,
        minutesUrl: parsed.minutesUrl,
        blocks: summarizeStatus(parsed),
      }),
    });

    if (parsed.minutesUrl) {
      logger.info({ simbliId: options.simbliId, minutesUrl: parsed.minutesUrl }, "Minutes link found");
    } else {
      logger.info({ simbliId: options.simbliId }, "No minutes link found on detail page");
    }

    return parsed;
  } catch (err) {
    await completeImportLog(log.id, {
      errorSummary: (err as Error).message,
    });
    throw err;
  }
};
