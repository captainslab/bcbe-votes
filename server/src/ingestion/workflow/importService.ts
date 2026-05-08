import { and, eq, ilike, or, sql } from "drizzle-orm";
import { db, schema } from "../../db";
import { fetchMeetingDetail, fetchMeetingListing } from "../fetchers/simbliFetcher";
import { fetchCompleteAgendaItem } from "../fetchers/simbliAgendaFetcher";
import { fetchSearchMeetingModule } from "../fetchers/simbliSearchFetcher";
import { parseAgendaItemLoaderResponse } from "../parsers/agendaItemParser";
import { parseSearchMeetingModuleResponse } from "../parsers/searchMeetingParser";
import { parseMeetingDetail, parseMeetingListing } from "../parsers/simbliParser";
import { normalizeWhitespace } from "../../utils/text";
import { logger } from "../../logging/logger";
import { HttpError } from "../../utils/httpError";
import { buildPersistedMinutesVoteOutput } from "../../services/minutesVoteService";
import { extractPersonnelEntities } from "../../services/personnelEntityService";
import { extractPropertyEntities } from "../../services/propertyEntityService";
import {
  canonicalizeBoardMemberName,
  getBoardMemberLookupVariants,
  mergeBoardMemberAliases,
} from "../../utils/boardMembers";

export class NoVoteContentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NoVoteContentError";
  }
}

export class NoSearchReplayMatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NoSearchReplayMatchError";
  }
}

export class NoSearchReplayVoteContentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NoSearchReplayVoteContentError";
  }
}

const minutesSearchQueries = [
  "carried",
  "no",
  "failed",
  "unanimous",
  "ayes",
  "nays",
  "abstain",
  "approved",
  "passed",
  "denied",
];

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
  const lookupVariants = getBoardMemberLookupVariants(rawName);
  const canonicalName = canonicalizeBoardMemberName(rawName);
  if (!canonicalName) return null;

  const existing = await tx
    .select()
    .from(schema.boardMembers)
    .where(
      or(
        ...lookupVariants.flatMap((name) => [
          ilike(schema.boardMembers.name, name),
          sql`${schema.boardMembers.aliases} @> ${JSON.stringify([name])}::jsonb`,
        ]),
      ),
    )
    .limit(1);

  if (existing.length) {
    const member = existing[0];
    const mergedAliases = mergeBoardMemberAliases(member.aliases, rawName);
    const aliasChanged =
      mergedAliases.length !== member.aliases.length ||
      mergedAliases.some((alias, index) => alias !== member.aliases[index]);

    if (member.name !== canonicalName || aliasChanged) {
      await tx
        .update(schema.boardMembers)
        .set({
          name: canonicalName,
          aliases: mergedAliases,
          updatedAt: new Date(),
        })
        .where(eq(schema.boardMembers.id, member.id));
    }

    return member.id;
  }

  const [created] = await tx
    .insert(schema.boardMembers)
    .values({
      name: canonicalName,
      aliases: mergeBoardMemberAliases([], rawName),
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
      contentText: item.contentText,
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
        contentText: item.contentText,
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

type SavedVoteItemStub = {
  id: number;
  itemTitle: string;
  agendaSection: string | null | undefined;
  contentText: string | null | undefined;
  summaryText: string | null | undefined;
  motionText: string | null | undefined;
  sourceExcerpt: string | null | undefined;
};

const persistVoteItems = async (
  tx: any,
  meetingRow: typeof schema.meetings.$inferSelect,
  voteItems: ReturnType<typeof parseMeetingDetail>["voteItems"],
): Promise<SavedVoteItemStub[]> => {
  const saved: SavedVoteItemStub[] = [];

  for (const item of voteItems) {
    const voteItemRow = await upsertVoteItem(tx, meetingRow.id, item);
    saved.push({
      id: voteItemRow.id,
      itemTitle: item.itemTitle,
      agendaSection: item.agendaSection,
      contentText: item.contentText,
      summaryText: item.summaryText,
      motionText: item.motionText,
      sourceExcerpt: item.sourceExcerpt,
    });

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

  return saved;
};

const extractAndPersistPersonnelEntities = async (items: SavedVoteItemStub[]) => {
  for (const item of items) {
    const entities = await extractPersonnelEntities(item);
    if (!entities) continue;
    await db
      .update(schema.voteItems)
      .set({ personnelEntities: entities })
      .where(eq(schema.voteItems.id, item.id));
  }
};

const extractAndPersistPropertyEntities = async (items: SavedVoteItemStub[]) => {
  for (const item of items) {
    const entities = await extractPropertyEntities(item);
    if (!entities) continue;
    await db
      .update(schema.voteItems)
      .set({ propertyEntities: entities })
      .where(eq(schema.voteItems.id, item.id));
  }
};

export const persistImportedMeetingVoteItems = async ({
  meeting,
  voteItems,
}: {
  meeting: ReturnType<typeof parseMeetingDetail>["meeting"] & { simbliId: string };
  voteItems: ReturnType<typeof parseMeetingDetail>["voteItems"];
}) => {
  let savedItems: SavedVoteItemStub[] = [];

  const result = await db.transaction(async (tx) => {
    const meetingRow = await upsertMeeting(tx, meeting);
    savedItems = await persistVoteItems(tx, meetingRow, voteItems);

    await tx
      .update(schema.meetings)
      .set({
        ingestionStatus: "completed",
        minutesUrl: meeting.minutesUrl,
        updatedAt: new Date(),
      })
      .where(eq(schema.meetings.id, meetingRow.id));

    return { meetingRow, voteItemsCreated: voteItems.length };
  });

  await extractAndPersistPersonnelEntities(savedItems);
  await extractAndPersistPropertyEntities(savedItems);
  return result;
};

const matchesMinutesSearchRow = (
  meeting: typeof schema.meetings.$inferSelect,
  row: ReturnType<typeof parseSearchMeetingModuleResponse>["meetingSearchResponseDTOs"][number],
) =>
  normalizeWhitespace(row.MeetingTitle).toLowerCase() === normalizeWhitespace(meeting.title).toLowerCase() &&
  String(row.MeetingDate).slice(0, 10) === meeting.date.toISOString().slice(0, 10);

const toParsedVoteItem = (
  output: ReturnType<typeof buildPersistedMinutesVoteOutput>,
  requestUrl: string,
) => {
  const normalizedMotionText = output.voteItem.motionText
    ? normalizeWhitespace(output.voteItem.motionText).replace(/^to\s+/i, "")
    : null;
  const item: ReturnType<typeof parseMeetingDetail>["voteItems"][number] = {
    itemTitle: output.voteItem.itemTitle,
    summarySource: output.voteItem.summarySource || requestUrl,
    summaryConfidenceScore: output.voteItem.summaryConfidenceScore,
    isNonUnanimous: output.voteItem.isNonUnanimous,
    voteTally: output.voteItem.voteTally,
    verificationStatus: output.voteItem.verificationStatus,
    votes: output.voteRecords.map((vote) => ({
      memberName: vote.memberName,
      value: vote.voteValue,
    })),
  };

  if (output.voteItem.agendaSection) item.agendaSection = output.voteItem.agendaSection;
  if (output.voteItem.summaryText) item.summaryText = output.voteItem.summaryText;
  if (normalizedMotionText) item.motionText = normalizedMotionText;
  if (output.voteItem.motionMadeBy) item.motionMadeBy = output.voteItem.motionMadeBy;
  if (output.voteItem.motionSecondedBy) item.motionSecondedBy = output.voteItem.motionSecondedBy;
  if (output.voteItem.result) item.result = output.voteItem.result;
  if (output.voteItem.sourceExcerpt) item.sourceExcerpt = output.voteItem.sourceExcerpt;
  if (output.voteItem.contentText) item.contentText = output.voteItem.contentText;
  if (output.voteItem.detectedPattern) item.detectedPattern = output.voteItem.detectedPattern;
  if (output.voteItem.confidenceScore !== undefined) item.confidenceScore = output.voteItem.confidenceScore;

  return item;
};

const importMeetingByMinutesSearch = async (meeting: typeof schema.meetings.$inferSelect) => {
  const seenAgendaIds = new Set<string>();
  const voteItems: ReturnType<typeof parseMeetingDetail>["voteItems"] = [];
  let minutesUrl = meeting.minutesUrl ?? null;
  let matchedAgendaCount = 0;

  for (const query of minutesSearchQueries) {
    const searchRun = await fetchSearchMeetingModule({
      query,
      remoteDebugPort: 9222,
      timeoutMs: 90_000,
    });
    const parsedSearch = parseSearchMeetingModuleResponse(searchRun.searchResponseText);

    for (const row of parsedSearch.meetingSearchResponseDTOs ?? []) {
      if (!row.AgendaId || seenAgendaIds.has(row.AgendaId)) continue;
      if (!matchesMinutesSearchRow(meeting, row)) continue;
      matchedAgendaCount += 1;

      const fetched = await fetchCompleteAgendaItem({
        agendaId: row.AgendaId,
        enSiteId: row.EnSiteId,
        remoteDebugPort: 9222,
      });
      const parsedAgendaItem = parseAgendaItemLoaderResponse(fetched.text);
      const expectedMeetingId = Number(meeting.simbliId);
      if (!Number.isNaN(expectedMeetingId) && parsedAgendaItem.MeetingId !== expectedMeetingId) continue;

      const structured = buildPersistedMinutesVoteOutput(parsedAgendaItem);
      const hasVoteData =
        structured.voteRecords.length > 0 ||
        Object.values(structured.voteItem.voteTally).some((count) => count > 0) ||
        structured.voteItem.detectedPattern !== "minutes_no_vote_evidence";
      if (!hasVoteData) continue;

      seenAgendaIds.add(row.AgendaId);
      minutesUrl = fetched.url;
      voteItems.push(toParsedVoteItem(structured, fetched.url));
    }
  }

  if (voteItems.length === 0) {
    if (matchedAgendaCount === 0) {
      throw new NoSearchReplayMatchError(`No search replay hits found for meeting ${meeting.simbliId}`);
    }
    throw new NoSearchReplayVoteContentError(
      `Search replay found agenda hits but no vote-bearing content for meeting ${meeting.simbliId}`,
    );
  }

  let savedItems: SavedVoteItemStub[] = [];

  const result = await db.transaction(async (tx) => {
    const meetingRow = await upsertMeeting(tx, {
      simbliId: meeting.simbliId,
      date: meeting.date.toISOString(),
      title: meeting.title,
      type: meeting.type,
      sourceUrl: meeting.sourceUrl,
      minutesUrl: minutesUrl ?? undefined,
    });

    savedItems = await persistVoteItems(tx, meetingRow, voteItems);
    await tx
      .update(schema.meetings)
      .set({
        ingestionStatus: "completed",
        minutesUrl,
        updatedAt: new Date(),
      })
      .where(eq(schema.meetings.id, meetingRow.id));

    return { meetingRow, voteItemsCreated: voteItems.length };
  });

  await extractAndPersistPersonnelEntities(savedItems);
  await extractAndPersistPropertyEntities(savedItems);
  return result;
};

export const importMeetingById = async (simbliId: string) => {
  const log = await createImportLog("meeting");
  try {
    const existingMeeting = await db.query.meetings.findFirst({
      where: eq(schema.meetings.simbliId, simbliId),
    });

    if (existingMeeting?.ingestionStatus === "failed") {
      const fallback = await importMeetingByMinutesSearch(existingMeeting);
      await completeImportLog(log.id, {
        meetingsProcessed: 1,
        votesCreated: fallback.voteItemsCreated,
        recordsFlagged: 0,
      });
      return fallback.meetingRow;
    }

    const { html, sourceUrl } = await fetchMeetingDetail(simbliId);
    const parsed = parseMeetingDetail(html, sourceUrl);
    if (parsed.voteItems.length === 0) {
      if (existingMeeting) {
        const fallback = await importMeetingByMinutesSearch(existingMeeting);
        await completeImportLog(log.id, {
          meetingsProcessed: 1,
          votesCreated: fallback.voteItemsCreated,
          recordsFlagged: 0,
        });
        return fallback.meetingRow;
      }
      throw new NoVoteContentError(`No vote items found for meeting ${simbliId}`);
    }

    let htmlSavedItems: SavedVoteItemStub[] = [];
    const savedMeeting = await db.transaction(async (tx) => {
      const meetingRow = await upsertMeeting(tx, { ...parsed.meeting, simbliId });
      htmlSavedItems = await persistVoteItems(tx, meetingRow, parsed.voteItems);

      await tx
        .update(schema.meetings)
        .set({
          ingestionStatus: "completed",
          updatedAt: new Date(),
        })
        .where(eq(schema.meetings.id, meetingRow.id));

      return meetingRow;
    });

    await extractAndPersistPersonnelEntities(htmlSavedItems);
    await extractAndPersistPropertyEntities(htmlSavedItems);

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
