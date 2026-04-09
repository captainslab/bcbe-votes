import { and, eq, ilike, or, sql } from "drizzle-orm";
import { db, schema } from "../../db";
import { fetchMeetingDetail, fetchMeetingListing } from "../fetchers/simbliFetcher";
import { parseMeetingDetail, parseMeetingListing } from "../parsers/simbliParser";
import { normalizeWhitespace } from "../../utils/text";
import { logger } from "../../logging/logger";
import { HttpError } from "../../utils/httpError";

const createImportLog = async (type: string) => {
  const [log] = await db
    .insert(schema.importLogs)
    .values({ type })
    .returning();
  if (!log) {
    throw new Error("Failed to create import log");
  }
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

const resolveBoardMemberId = async (tx: any, rawName?: string | null) => {
  if (!rawName) return null;
  const name = normalizeWhitespace(rawName);
  if (!name) return null;

  const existing = await tx
    .select()
    .from(schema.boardMembers)
    .where(
      or(
        ilike(schema.boardMembers.name, name),
        sql`${schema.boardMembers.aliases} @> ${JSON.stringify([name])}::jsonb`,
      ),
    )
    .limit(1);

  if (existing.length) return existing[0].id;

  const [created] = await tx
    .insert(schema.boardMembers)
    .values({
      name,
      aliases: [name],
    })
    .onConflictDoUpdate({
      target: schema.boardMembers.name,
      set: { aliases: sql`array_append(${schema.boardMembers.aliases}, ${name})` },
    })
    .returning();

  return created.id;
};

const upsertMeeting = async (
  tx: any,
  meeting: ReturnType<typeof parseMeetingDetail>["meeting"] & { simbliId: string },
) => {
  const [saved] = await tx
    .insert(schema.meetings)
    .values({
      simbliId: meeting.simbliId,
      date: new Date(meeting.date),
      title: meeting.title,
      type: meeting.type,
      simbliSiteId: "200015",
      sourceUrl: meeting.sourceUrl,
      minutesUrl: meeting.minutesUrl,
      ingestionStatus: "in_progress",
      verificationStatus: "unverified",
    })
    .onConflictDoUpdate({
      target: schema.meetings.simbliId,
      set: {
        date: new Date(meeting.date),
        title: meeting.title,
        type: meeting.type,
        sourceUrl: meeting.sourceUrl,
        minutesUrl: meeting.minutesUrl,
        updatedAt: new Date(),
      },
    })
    .returning();

  if (!saved) throw new Error("Failed to save meeting");
  return saved;
};

const upsertVoteItem = async (
  tx: any,
  meetingId: number,
  item: ReturnType<typeof parseMeetingDetail>["voteItems"][number],
) => {
  const [saved] = await tx
    .insert(schema.voteItems)
    .values({
      meetingId,
      agendaSection: item.agendaSection,
      itemTitle: item.itemTitle,
      summaryText: item.summaryText,
      summarySource: item.summarySource,
      summaryConfidenceScore: item.summaryConfidenceScore,
      motionText: item.motionText,
      motionMadeBy: item.motionMadeBy,
      motionSecondedBy: item.motionSecondedBy,
      result: item.result,
      isNonUnanimous: item.isNonUnanimous,
      voteTally: item.voteTally,
      sourceExcerpt: item.sourceExcerpt,
      verificationStatus: item.verificationStatus,
      detectedPattern: item.detectedPattern,
      confidenceScore: item.confidenceScore,
    } as any)
    .onConflictDoUpdate({
      target: [
        schema.voteItems.meetingId,
        schema.voteItems.itemTitle,
        schema.voteItems.motionText,
      ],
      set: {
        agendaSection: item.agendaSection,
        summaryText: item.summaryText,
        summarySource: item.summarySource,
        summaryConfidenceScore: item.summaryConfidenceScore,
        motionText: item.motionText,
        motionMadeBy: item.motionMadeBy,
        motionSecondedBy: item.motionSecondedBy,
        result: item.result,
        isNonUnanimous: item.isNonUnanimous,
        voteTally: item.voteTally,
        sourceExcerpt: item.sourceExcerpt,
        verificationStatus: item.verificationStatus,
        detectedPattern: item.detectedPattern,
        confidenceScore: item.confidenceScore,
        updatedAt: new Date(),
      },
    } as any)
    .returning();

  if (!saved) throw new Error("Failed to save vote item");
  return saved;
};

export const importMeetingById = async (simbliId: string) => {
  const log = await createImportLog("meeting");
  try {
    const { html, sourceUrl } = await fetchMeetingDetail(simbliId);
    const parsed = parseMeetingDetail(html, sourceUrl);

    const savedMeeting = await db.transaction(async (tx) => {
      const meetingRow = await upsertMeeting(tx, { ...parsed.meeting, simbliId });

      for (const item of parsed.voteItems) {
        const voteItemRow = await upsertVoteItem(tx, meetingRow.id, item);

        const motionMakerId = await resolveBoardMemberId(tx, item.motionMadeBy);
        const motionSecondedId = await resolveBoardMemberId(tx, item.motionSecondedBy);
        if (motionMakerId) {
          await tx
            .update(schema.voteItems)
            .set({ motionMadeByMemberId: motionMakerId })
            .where(eq(schema.voteItems.id, voteItemRow.id));
        }
        if (motionSecondedId) {
          await tx
            .update(schema.voteItems)
            .set({ motionSecondedByMemberId: motionSecondedId })
            .where(eq(schema.voteItems.id, voteItemRow.id));
        }

        for (const vote of item.votes) {
          const memberId = await resolveBoardMemberId(tx, vote.memberName);
          if (!memberId) continue;
          await tx
            .insert(schema.voteRecords)
            .values({
              voteItemId: voteItemRow.id,
              boardMemberId: memberId,
              voteValue: vote.value as typeof schema.voteValueEnum.enumValues[number],
            })
            .onConflictDoUpdate({
              target: [schema.voteRecords.voteItemId, schema.voteRecords.boardMemberId],
              set: { voteValue: vote.value as typeof schema.voteValueEnum.enumValues[number] },
            });
        }
      }

      await tx
        .update(schema.meetings)
        .set({
          ingestionStatus: "completed",
          updatedAt: new Date(),
        })
        .where(eq(schema.meetings.id, meetingRow.id));

      return meetingRow;
    });

    await completeImportLog(log.id, {
      meetingsProcessed: 1,
      votesCreated: parsed.voteItems.length,
      recordsFlagged: 0,
    });

    return savedMeeting;
  } catch (err) {
    logger.error({ err }, "Import failed");
    await completeImportLog(log.id, {
      errorSummary: (err as Error).message,
    });
    throw err;
  }
};

export const importMeetingRange = async (startMid?: number, endMid?: number) => {
  const log = await createImportLog("batch");
  try {
    const listingHtml = await fetchMeetingListing();
    const meetings = parseMeetingListing(listingHtml);
    const filtered = meetings.filter((m) => {
      const idNum = Number(m.simbliId);
      if (Number.isNaN(idNum)) return false;
      if (startMid && idNum < startMid) return false;
      if (endMid && idNum > endMid) return false;
      return true;
    });

    let processed = 0;
    let votesCreated = 0;

    for (const meeting of filtered) {
      try {
        const saved = await importMeetingById(meeting.simbliId);
        processed += 1;
        votesCreated += saved ? 1 : 0;
      } catch (err) {
        logger.warn({ err }, `Meeting ${meeting.simbliId} failed, continuing`);
        continue;
      }
    }

    await completeImportLog(log.id, {
      meetingsProcessed: processed,
      votesCreated,
      recordsFlagged: 0,
    });

    return { processed, votesCreated };
  } catch (err) {
    await completeImportLog(log.id, { errorSummary: (err as Error).message });
    throw err;
  }
};

export const reimportMeeting = async (meetingId: number) => {
  const meeting = await db.query.meetings.findFirst({
    where: eq(schema.meetings.id, meetingId),
  });
  if (!meeting) {
    throw new HttpError(404, "Meeting not found");
  }
  return importMeetingById(meeting.simbliId);
};
