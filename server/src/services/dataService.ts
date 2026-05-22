import { and, eq, ilike, or, sql } from "drizzle-orm";
import { db, schema } from "../db";
import {
  buildMemberNoVoteItems,
  buildSourceAuditInfo,
  canonicalBoardMembers,
  categorizeVoteItemText,
  getCanonicalBoardMemberName,
  getNeutralPublicPersonName,
  sanitizePublicVoteDisplayText,
  type CanonicalBoardMemberName,
} from "../utils/boardVotes";
import { getSourcedMemberProfile } from "../utils/memberProfiles";
import { normalizeWhitespace } from "../utils/text";

const filterCanonicalVoteRecords = <T extends { voteRecords?: Array<{ boardMember?: { name?: string | null } | null }> | null }>(
  voteItem: T,
) => {
  const voteRecords = (voteItem.voteRecords ?? [])
    .map((record) => {
      const canonicalName = getNeutralPublicPersonName(record.boardMember?.name ?? null);
      if (!canonicalName) return null;

      return {
        ...record,
        boardMember: {
          name: canonicalName,
        },
      };
    })
    .filter((record): record is NonNullable<typeof record> => Boolean(record));

  return {
    ...voteItem,
    voteRecords,
  };
};

const enrichVoteItem = <T extends {
  itemTitle?: string | null;
  motionText?: string | null;
  motionMadeBy?: string | null;
  motionSecondedBy?: string | null;
  summaryText?: string | null;
  sourceExcerpt?: string | null;
  result?: string | null;
  executiveSessionReason?: string | null;
  meeting?: { sourceUrl?: string | null } | null;
  voteRecords?: Array<{ boardMember?: { name?: string | null } | null }> | null;
}>(voteItem: T) => {
  const categoryInfo = categorizeVoteItemText({
    itemTitle: voteItem.itemTitle ?? null,
    motionText: voteItem.motionText ?? null,
    summaryText: voteItem.summaryText ?? null,
    sourceExcerpt: voteItem.sourceExcerpt ?? null,
  });
  const sourceInfo = buildSourceAuditInfo(voteItem.meeting?.sourceUrl ?? null);

  return {
    ...filterCanonicalVoteRecords(voteItem),
    itemTitle: sanitizePublicVoteDisplayText(voteItem.itemTitle),
    motionMadeBy: getNeutralPublicPersonName(voteItem.motionMadeBy ?? null),
    motionSecondedBy: getNeutralPublicPersonName(voteItem.motionSecondedBy ?? null),
    motionText: sanitizePublicVoteDisplayText(voteItem.motionText),
    summaryText: sanitizePublicVoteDisplayText(voteItem.summaryText),
    sourceExcerpt: sanitizePublicVoteDisplayText(voteItem.sourceExcerpt),
    result: sanitizePublicVoteDisplayText(voteItem.result, "strict-outcome"),
    category: categoryInfo.category,
    categoryConfidence: categoryInfo.categoryConfidence,
    sourceUrl: sourceInfo.sourceUrl,
    sourceAvailability: sourceInfo.sourceAvailability,
    sourceLabel: sourceInfo.sourceLabel,
    executiveSessionReason: voteItem.executiveSessionReason ?? null,
  };
};

export const listMeetings = async (limit = 200, offset = 0, boardId?: number | null) => {
  const meetings = await db.query.meetings.findMany({
    limit,
    offset,
    where: boardId != null ? eq(schema.meetings.boardId, boardId) : undefined,
    orderBy: (meeting, { desc }) => [desc(meeting.date)],
    with: {
      voteItems: {
        columns: {
          id: true,
        },
      },
    },
  });

  return meetings.map(({ voteItems, ...meeting }) => ({
    ...meeting,
    voteItemCount: voteItems.length,
  }));
};

export const getMeeting = async (id: number) => {
  const meeting = await db.query.meetings.findFirst({
    where: eq(schema.meetings.id, id),
    with: {
      voteItems: {
        with: {
          voteRecords: {
            with: {
              boardMember: true,
            },
          },
        },
      },
    },
  });

  if (!meeting) return null;

  return {
    ...meeting,
    voteItems: meeting.voteItems.map((item) => enrichVoteItem(item)),
  };
};

export const listVotes = async (nonUnanimousOnly = true, limit = 5000, offset = 0, boardId?: number | null) => {
  const votes = await db.query.voteItems.findMany({
    where: (() => {
      const nonUnanFilter = nonUnanimousOnly ? eq(schema.voteItems.isNonUnanimous, true) : undefined;
      // boardId filtering via a subquery on meeting
      if (boardId != null) {
        const boardFilter = sql`${schema.voteItems.meetingId} IN (SELECT id FROM meetings WHERE board_id = ${boardId})`;
        return nonUnanFilter ? and(nonUnanFilter, boardFilter) : boardFilter;
      }
      return nonUnanFilter;
    })(),
    with: {
      meeting: true,
      voteRecords: {
        with: {
          boardMember: true,
        },
      },
    },
  });

  votes.sort((a, b) => {
    const dateA = a.meeting?.date ? new Date(a.meeting.date).getTime() : 0;
    const dateB = b.meeting?.date ? new Date(b.meeting.date).getTime() : 0;
    return dateB - dateA;
  });

  return votes.slice(offset, offset + limit).map((vote) => enrichVoteItem(vote));
};

export const getVote = async (id: number) => {
  const vote = await db.query.voteItems.findFirst({
    where: eq(schema.voteItems.id, id),
    with: {
      meeting: true,
      voteRecords: {
        with: {
          boardMember: true,
        },
      },
    },
  });

  return vote ? enrichVoteItem(vote) : null;
};

export const listMembers = async (boardId?: number | null) => {
  const members = await db.query.boardMembers.findMany({
    where: boardId != null ? eq(schema.boardMembers.boardId, boardId) : undefined,
    orderBy: (member, { asc }) => [asc(member.name)],
  });

  return members
    .map((member) => {
      const canonicalName = getCanonicalBoardMemberName(member.name);
      if (!canonicalName) return null;
      return {
        ...member,
        name: canonicalName,
      };
    })
    .filter((member): member is NonNullable<typeof member> => Boolean(member));
};

export const getMember = async (id: number) => {
  const member = await db.query.boardMembers.findFirst({
    where: eq(schema.boardMembers.id, id),
  });

  if (!member) return null;

  const canonicalName = getCanonicalBoardMemberName(member.name);
  if (!canonicalName) return null;
  const sourcedProfile = getSourcedMemberProfile(canonicalName);

  return {
    ...member,
    name: canonicalName,
    district: member.district ?? sourcedProfile.district,
    profile: sourcedProfile,
  };
};

export const getMemberNoVoteItems = async (memberId: number) => {
  const member = await db.query.boardMembers.findFirst({
    where: eq(schema.boardMembers.id, memberId),
  });
  const canonicalName = getCanonicalBoardMemberName(member?.name ?? null);
  if (!member || !canonicalName) return [];

  const voteItems = await db.query.voteItems.findMany({
    with: {
      meeting: true,
      voteRecords: {
        with: {
          boardMember: true,
        },
      },
    },
  });

  voteItems.sort((a, b) => {
    const dateA = a.meeting?.date ? new Date(a.meeting.date).getTime() : 0;
    const dateB = b.meeting?.date ? new Date(b.meeting.date).getTime() : 0;
    if (dateB !== dateA) return dateB - dateA;
    return b.id - a.id;
  });

  return buildMemberNoVoteItems(
    canonicalName,
    voteItems.map((item) => {
      const categoryInfo = categorizeVoteItemText({
        itemTitle: item.itemTitle,
        motionText: item.motionText,
        summaryText: item.summaryText,
        sourceExcerpt: item.sourceExcerpt,
      });

      return {
        voteItemId: item.id,
        meetingId: item.meetingId,
        meetingDate: item.meeting?.date ? item.meeting.date.toISOString() : null,
        meetingTitle: item.meeting?.title ?? null,
        meetingType: item.meeting?.type ?? null,
        sourceUrl: item.meeting?.sourceUrl ?? null,
        itemTitle: item.itemTitle,
        motionText: item.motionText,
        summaryText: item.summaryText,
        result: item.result,
        verificationStatus: item.verificationStatus,
        confidenceScore: item.confidenceScore,
        sourceExcerpt: item.sourceExcerpt,
        category: categoryInfo.category,
        categoryConfidence: categoryInfo.categoryConfidence,
        personnelEntities: item.personnelEntities ?? null,
        propertyEntities: item.propertyEntities ?? null,
        voteRecords: item.voteRecords.map((record) => ({
          boardMember: { name: record.boardMember?.name ?? null },
          voteValue: record.voteValue,
        })),
      };
    }),
  );
};

export const getMemberMotions = async (memberId: number) => {
  const made = await db.query.voteItems.findMany({
    where: eq(schema.voteItems.motionMadeByMemberId, memberId),
    with: { meeting: true },
  });

  const seconded = await db.query.voteItems.findMany({
    where: eq(schema.voteItems.motionSecondedByMemberId, memberId),
    with: { meeting: true },
  });

  const toShape = (item: typeof made[number], role: "made" | "seconded") => {
    const categoryInfo = categorizeVoteItemText({
      itemTitle: item.itemTitle,
      motionText: item.motionText,
      summaryText: item.summaryText,
      sourceExcerpt: item.sourceExcerpt,
    });
    const sourceInfo = buildSourceAuditInfo(item.meeting?.sourceUrl ?? null);
    return {
      voteItemId: item.id,
      meetingId: item.meetingId,
      meetingDate: item.meeting?.date ? item.meeting.date.toISOString() : null,
      meetingTitle: item.meeting?.title ?? null,
      meetingType: item.meeting?.type ?? null,
      sourceUrl: sourceInfo.sourceUrl,
      sourceAvailability: sourceInfo.sourceAvailability,
      itemTitle: sanitizePublicVoteDisplayText(item.itemTitle),
      motionText: sanitizePublicVoteDisplayText(item.motionText),
      summaryText: sanitizePublicVoteDisplayText(item.summaryText),
      isNonUnanimous: item.isNonUnanimous,
      voteTally: item.voteTally,
      verificationStatus: item.verificationStatus,
      category: categoryInfo.category,
      role,
      personnelEntities: item.personnelEntities ?? null,
      propertyEntities: item.propertyEntities ?? null,
    };
  };

  return {
    made: sortVoteItemsByMeetingDateDesc(made).map((item) => toShape(item, "made")),
    seconded: sortVoteItemsByMeetingDateDesc(seconded).map((item) => toShape(item, "seconded")),
  };
};


export const searchMemberByNameOrAlias = async (name: string) => {
  const normalized = normalizeWhitespace(name);
  return db
    .select()
    .from(schema.boardMembers)
    .where(
      or(
        ilike(schema.boardMembers.name, `%${normalized}%`),
        sql`${schema.boardMembers.aliases}::text ILIKE ${`%${normalized}%`}`,
      ),
    )
    .limit(5);
};

// ---------------------------------------------------------------------------
// Chat data query functions
// ---------------------------------------------------------------------------

export type ChatVoteSummary = {
  voteItemId: number;
  itemTitle: string;
  displayText: string;
  meetingDate: string;
  meetingTitle: string;
  meetingType: string;
  category: string;
  isNonUnanimous: boolean;
  tally: Record<string, number>;
  noOrAbstainVoters: string[];
  matchedSnippet?: string;
  executiveSessionReason?: string | null;
};

export type ChatExecutiveSessionSummary = {
  voteItemId: number;
  itemTitle: string;
  meetingDate: string;
  meetingTitle: string;
  reason: string;
  motionMadeBy: string | null;
  motionSecondedBy: string | null;
};

export type ChatMeetingSummary = {
  meetingId: number;
  meetingDate: string;
  meetingTitle: string;
  meetingType: string;
  voteItemCount: number;
  nonUnanimousCount: number;
  categories: Array<{ category: string; count: number }>;
  notableVotes: ChatVoteSummary[];
};

const toDateString = (value?: Date | null) => value?.toISOString().slice(0, 10) ?? "";

const getVoteDisplayText = (voteItem: {
  itemTitle?: string | null;
  motionText?: string | null;
  summaryText?: string | null;
}) =>
  [voteItem.motionText, voteItem.summaryText, voteItem.itemTitle]
    .map((value) => sanitizePublicVoteDisplayText(value))
    .find((value) => value && value !== "Needs review") ?? "Needs review";

const buildMatchedSnippet = (
  voteItem: {
    itemTitle?: string | null;
    motionText?: string | null;
    summaryText?: string | null;
    sourceExcerpt?: string | null;
    contentText?: string | null;
  },
  searchTerm: string,
) => {
  const lowerTerm = searchTerm.toLowerCase();
  const fields = [
    voteItem.summaryText,
    voteItem.motionText,
    voteItem.sourceExcerpt,
    voteItem.contentText,
    voteItem.itemTitle,
  ];

  for (const field of fields) {
    const normalized = normalizeWhitespace(field ?? "");
    if (!normalized) continue;
    const lowerField = normalized.toLowerCase();
    const matchIndex = lowerField.indexOf(lowerTerm);
    if (matchIndex === -1) continue;

    const start = Math.max(0, matchIndex - 90);
    const end = Math.min(normalized.length, matchIndex + searchTerm.length + 140);
    const prefix = start > 0 ? "... " : "";
    const suffix = end < normalized.length ? " ..." : "";
    return `${prefix}${normalized.slice(start, end)}${suffix}`;
  }

  return undefined;
};

const toChatVoteSummary = (voteItem: {
  id: number;
  itemTitle?: string | null;
  motionText?: string | null;
  summaryText?: string | null;
  sourceExcerpt?: string | null;
  executiveSessionReason?: string | null;
  isNonUnanimous: boolean;
  voteTally: Record<string, number>;
  meeting?: { date?: Date | null; title?: string | null; type?: string | null } | null;
  voteRecords?: Array<{ voteValue: string; boardMember?: { name?: string | null } | null }> | null;
  matchedSnippet?: string;
}): ChatVoteSummary => {
  const { category } = categorizeVoteItemText({
    itemTitle: voteItem.itemTitle ?? null,
    motionText: voteItem.motionText ?? null,
    summaryText: voteItem.summaryText ?? null,
    sourceExcerpt: voteItem.sourceExcerpt ?? null,
  });
  const noOrAbstainVoters = (voteItem.voteRecords ?? [])
    .filter((record) => record.voteValue === "no" || record.voteValue === "abstain")
    .map((record) => getNeutralPublicPersonName(record.boardMember?.name ?? null))
    .filter((name): name is string => name !== null);

  return {
    voteItemId: voteItem.id,
    itemTitle: sanitizePublicVoteDisplayText(voteItem.itemTitle),
    displayText: getVoteDisplayText(voteItem),
    meetingDate: toDateString(voteItem.meeting?.date ?? null),
    meetingTitle: voteItem.meeting?.title ?? "Needs review",
    meetingType: voteItem.meeting?.type ?? "Needs review",
    category,
    isNonUnanimous: voteItem.isNonUnanimous,
    tally: voteItem.voteTally ?? {},
    noOrAbstainVoters,
    ...(voteItem.matchedSnippet ? { matchedSnippet: voteItem.matchedSnippet } : {}),
    ...(voteItem.executiveSessionReason ? { executiveSessionReason: sanitizePublicVoteDisplayText(voteItem.executiveSessionReason) } : {}),
  };
};

const sortVoteItemsByMeetingDateDesc = <T extends { meeting?: { date?: Date | null } | null; id?: number }>(items: T[]) =>
  items.sort((a, b) => {
    const dateA = a.meeting?.date ? new Date(a.meeting.date).getTime() : 0;
    const dateB = b.meeting?.date ? new Date(b.meeting.date).getTime() : 0;
    if (dateB !== dateA) return dateB - dateA;
    return (b.id ?? 0) - (a.id ?? 0);
  });

export const getRecentMeetingSummaries = async (limit = 1): Promise<ChatMeetingSummary[]> => {
  const meetings = await db.query.meetings.findMany({
    limit: Math.max(limit * 8, 8),
    orderBy: (meeting, { desc }) => [desc(meeting.date)],
    with: {
      voteItems: {
        with: {
          voteRecords: {
            with: {
              boardMember: true,
            },
          },
        },
      },
    },
  });

  const meetingsWithVoteItems = meetings.filter((meeting) => meeting.voteItems.length > 0);
  const selectedMeetings = (meetingsWithVoteItems.length > 0 ? meetingsWithVoteItems : meetings).slice(0, limit);

  return selectedMeetings.map((meeting) => {
    const categories = new Map<string, number>();
    for (const voteItem of meeting.voteItems) {
      const { category } = categorizeVoteItemText({
        itemTitle: voteItem.itemTitle,
        motionText: voteItem.motionText,
        summaryText: voteItem.summaryText,
        sourceExcerpt: voteItem.sourceExcerpt,
      });
      categories.set(category, (categories.get(category) ?? 0) + 1);
    }

    const notableVotes = [...meeting.voteItems]
      .sort((a, b) => Number(b.isNonUnanimous) - Number(a.isNonUnanimous))
      .slice(0, 5)
      .map((voteItem) => toChatVoteSummary({ ...voteItem, meeting }));

    return {
      meetingId: meeting.id,
      meetingDate: toDateString(meeting.date),
      meetingTitle: meeting.title,
      meetingType: meeting.type,
      voteItemCount: meeting.voteItems.length,
      nonUnanimousCount: meeting.voteItems.filter((item) => item.isNonUnanimous).length,
      categories: Array.from(categories.entries())
        .map(([category, count]) => ({ category, count }))
        .sort((a, b) => b.count - a.count),
      notableVotes,
    };
  });
};

export const getRecentVoteSummaries = async (limit = 8): Promise<ChatVoteSummary[]> => {
  const votes = await db.query.voteItems.findMany({
    with: {
      meeting: true,
      voteRecords: {
        with: {
          boardMember: true,
        },
      },
    },
  });

  return sortVoteItemsByMeetingDateDesc(votes).slice(0, limit).map((vote) => toChatVoteSummary(vote));
};

export const searchVoteItemsForChat = async (searchTerm: string, limit = 8): Promise<ChatVoteSummary[]> => {
  const normalized = normalizeWhitespace(searchTerm).slice(0, 120);
  if (!normalized) return [];

  const pattern = `%${normalized}%`;
  const votes = await db.query.voteItems.findMany({
    where: or(
      ilike(schema.voteItems.itemTitle, pattern),
      ilike(schema.voteItems.motionText, pattern),
      ilike(schema.voteItems.summaryText, pattern),
      ilike(schema.voteItems.sourceExcerpt, pattern),
      ilike(schema.voteItems.contentText, pattern),
      ilike(schema.voteItems.executiveSessionReason, pattern),
    ),
    with: {
      meeting: true,
      voteRecords: {
        with: {
          boardMember: true,
        },
      },
    },
  });

  sortVoteItemsByMeetingDateDesc(votes);

  return votes.slice(0, limit).map((vote) => {
    const matchedSnippet = buildMatchedSnippet(vote, normalized);
    return toChatVoteSummary({
      ...vote,
      ...(matchedSnippet ? { matchedSnippet } : {}),
    });
  });
};

export type MemberVoteStats = {
  name: CanonicalBoardMemberName;
  yes: number;
  no: number;
  abstain: number;
  recused: number;
  absent: number;
  total: number;
  dissentRate: number;
};

/**
 * Returns vote totals and dissent rate for a canonical board member.
 * Fuzzy-matches the supplied name via the canonical alias map.
 */
export const getMemberVoteStats = async (memberName: string): Promise<MemberVoteStats | null> => {
  const canonical = getCanonicalBoardMemberName(memberName);
  if (!canonical) return null;

  const members = await db
    .select({ id: schema.boardMembers.id, name: schema.boardMembers.name })
    .from(schema.boardMembers);

  // Collect all member IDs that map to this canonical name
  const matchIds = members
    .filter((m) => getCanonicalBoardMemberName(m.name) === canonical)
    .map((m) => m.id);

  if (matchIds.length === 0) return null;

  const rows = await db
    .select({
      voteValue: schema.voteRecords.voteValue,
      isNonUnanimous: schema.voteItems.isNonUnanimous,
      voteTally: schema.voteItems.voteTally,
    })
    .from(schema.voteRecords)
    .leftJoin(schema.voteItems, eq(schema.voteRecords.voteItemId, schema.voteItems.id))
    .where(sql`${schema.voteRecords.boardMemberId} = ANY(${sql.raw(`ARRAY[${matchIds.join(",")}]::int[]`)})`);

  const totals: Record<string, number> = { yes: 0, no: 0, abstain: 0, recused: 0, absent: 0 };
  let dissentCount = 0;
  let total = 0;

  for (const row of rows) {
    total += 1;
    totals[row.voteValue] = (totals[row.voteValue] ?? 0) + 1;

    // Dissent = voted differently from plurality
    const tally = row.voteTally ?? {};
    let maxCount = 0;
    let majorityVote: string | null = null;
    for (const [v, c] of Object.entries(tally)) {
      if (c > maxCount) { maxCount = c; majorityVote = v; }
    }
    if (majorityVote && row.voteValue !== majorityVote) dissentCount += 1;
  }

  return {
    name: canonical,
    yes: totals.yes ?? 0,
    no: totals.no ?? 0,
    abstain: totals.abstain ?? 0,
    recused: totals.recused ?? 0,
    absent: totals.absent ?? 0,
    total,
    dissentRate: total > 0 ? dissentCount / total : 0,
  };
};

export type MemberCategoryBreakdownRow = {
  category: string;
  yes: number;
  no: number;
  abstain: number;
  total: number;
};

/**
 * Returns per-category vote breakdown for a canonical board member.
 */
export const getMemberCategoryBreakdown = async (memberName: string): Promise<MemberCategoryBreakdownRow[]> => {
  const canonical = getCanonicalBoardMemberName(memberName);
  if (!canonical) return [];

  const members = await db
    .select({ id: schema.boardMembers.id, name: schema.boardMembers.name })
    .from(schema.boardMembers);

  const matchIds = members
    .filter((m) => getCanonicalBoardMemberName(m.name) === canonical)
    .map((m) => m.id);

  if (matchIds.length === 0) return [];

  const rows = await db
    .select({
      voteValue: schema.voteRecords.voteValue,
      itemTitle: schema.voteItems.itemTitle,
      motionText: schema.voteItems.motionText,
      summaryText: schema.voteItems.summaryText,
      sourceExcerpt: schema.voteItems.sourceExcerpt,
    })
    .from(schema.voteRecords)
    .leftJoin(schema.voteItems, eq(schema.voteRecords.voteItemId, schema.voteItems.id))
    .where(sql`${schema.voteRecords.boardMemberId} = ANY(${sql.raw(`ARRAY[${matchIds.join(",")}]::int[]`)})`);

  const byCategory = new Map<string, { yes: number; no: number; abstain: number; total: number }>();

  for (const row of rows) {
    const { category } = categorizeVoteItemText({
      itemTitle: row.itemTitle ?? null,
      motionText: row.motionText ?? null,
      summaryText: row.summaryText ?? null,
      sourceExcerpt: row.sourceExcerpt ?? null,
    });
    const entry = byCategory.get(category) ?? { yes: 0, no: 0, abstain: 0, total: 0 };
    entry.total += 1;
    if (row.voteValue === "yes") entry.yes += 1;
    else if (row.voteValue === "no") entry.no += 1;
    else if (row.voteValue === "abstain") entry.abstain += 1;
    byCategory.set(category, entry);
  }

  return Array.from(byCategory.entries())
    .map(([category, data]) => ({ category, ...data }))
    .sort((a, b) => b.total - a.total);
};

export type NonUnanimousVoteSummary = {
  voteItemId: number;
  itemTitle: string;
  meetingDate: string;
  category: string;
  tally: Record<string, number>;
  noVoters: string[];
};

/**
 * Returns the most recent non-unanimous vote items with who voted no.
 */
export const getRecentNonUnanimousVotes = async (limit = 10): Promise<NonUnanimousVoteSummary[]> => {
  const items = await db.query.voteItems.findMany({
    where: eq(schema.voteItems.isNonUnanimous, true),
    with: {
      meeting: { columns: { date: true } },
      voteRecords: {
        with: { boardMember: { columns: { name: true } } },
      },
    },
  });

  return sortVoteItemsByMeetingDateDesc(items).slice(0, limit).map((item) => {
    const { category } = categorizeVoteItemText({
      itemTitle: item.itemTitle,
      motionText: item.motionText,
      summaryText: item.summaryText,
      sourceExcerpt: item.sourceExcerpt,
    });
    const noVoters = item.voteRecords
      .filter((r) => r.voteValue === "no" || r.voteValue === "abstain")
      .map((r) => getNeutralPublicPersonName(r.boardMember?.name ?? null))
      .filter((n): n is string => n !== null);

    return {
      voteItemId: item.id,
      itemTitle: sanitizePublicVoteDisplayText(item.itemTitle),
      meetingDate: item.meeting?.date ? item.meeting.date.toISOString().slice(0, 10) : "",
      category,
      tally: item.voteTally ?? {},
      noVoters,
    };
  });
};

export type CategoryCountResult = {
  category: string;
  total: number;
  nonUnanimous: number;
};

/**
 * Returns the total and non-unanimous vote count for a given category name
 * (fuzzy-matched against known category labels).
 */
export const getCategoryCount = async (categoryQuery: string): Promise<CategoryCountResult | null> => {
  const items = await db.query.voteItems.findMany({
    columns: {
      itemTitle: true,
      motionText: true,
      summaryText: true,
      sourceExcerpt: true,
      isNonUnanimous: true,
    },
  });

  const counts = new Map<string, { total: number; nonUnanimous: number }>();

  for (const item of items) {
    const { category } = categorizeVoteItemText({
      itemTitle: item.itemTitle ?? null,
      motionText: item.motionText ?? null,
      summaryText: item.summaryText ?? null,
      sourceExcerpt: item.sourceExcerpt ?? null,
    });
    const entry = counts.get(category) ?? { total: 0, nonUnanimous: 0 };
    entry.total += 1;
    if (item.isNonUnanimous) entry.nonUnanimous += 1;
    counts.set(category, entry);
  }

  const normalized = categoryQuery.toLowerCase().trim();
  for (const [cat, data] of counts.entries()) {
    if (cat.toLowerCase().includes(normalized) || normalized.includes(cat.toLowerCase().split(" ")[0] ?? "")) {
      return { category: cat, ...data };
    }
  }

  // Try partial word match
  const words = normalized.split(/\s+/);
  for (const [cat, data] of counts.entries()) {
    const catLower = cat.toLowerCase();
    if (words.some((w) => w.length >= 4 && catLower.includes(w))) {
      return { category: cat, ...data };
    }
  }

  return null;
};

export type PropertyTransactionRow = {
  voteItemId: number;
  itemTitle: string;
  meetingDate: string;
  actionType: string;
  party: string | null;
  location: string | null;
  statedUse: string | null;
};

/**
 * Returns property transactions extracted from vote items, optionally filtered by action type.
 */
export const getPropertyTransactions = async (actionType?: string): Promise<PropertyTransactionRow[]> => {
  const items = await db.query.voteItems.findMany({
    columns: {
      id: true,
      itemTitle: true,
      propertyEntities: true,
    },
    with: {
      meeting: { columns: { date: true } },
    },
    where: sql`${schema.voteItems.propertyEntities} IS NOT NULL`,
  });

  const results: PropertyTransactionRow[] = [];

  for (const item of sortVoteItemsByMeetingDateDesc(items)) {
    const entities = item.propertyEntities;
    if (!Array.isArray(entities) || entities.length === 0) continue;

    for (const entity of entities) {
      if (actionType) {
        const at = entity.actionType?.toLowerCase() ?? "";
        if (!at.includes(actionType.toLowerCase())) continue;
      }
      results.push({
        voteItemId: item.id,
        itemTitle: sanitizePublicVoteDisplayText(item.itemTitle),
        meetingDate: item.meeting?.date ? item.meeting.date.toISOString().slice(0, 10) : "",
        actionType: entity.actionType ?? "other",
        party: entity.partyName ?? null,
        location: entity.location ?? entity.address ?? null,
        statedUse: entity.statedUse ?? null,
      });
    }
  }

  return results;
};

export type PersonnelActionRow = {
  voteItemId: number;
  personName: string;
  actionType: string;
  position: string | null;
  school: string | null;
  meetingDate: string;
};

/**
 * Returns personnel actions extracted from vote items, optionally filtered by action type.
 */
export const getPersonnelActions = async (actionType?: string): Promise<PersonnelActionRow[]> => {
  const items = await db.query.voteItems.findMany({
    columns: {
      id: true,
      itemTitle: true,
      personnelEntities: true,
    },
    with: {
      meeting: { columns: { date: true } },
    },
    where: sql`${schema.voteItems.personnelEntities} IS NOT NULL`,
  });

  const results: PersonnelActionRow[] = [];

  for (const item of sortVoteItemsByMeetingDateDesc(items)) {
    const entities = item.personnelEntities;
    if (!Array.isArray(entities) || entities.length === 0) continue;

    for (const entity of entities) {
      if (actionType) {
        const at = entity.actionType?.toLowerCase() ?? "";
        if (!at.includes(actionType.toLowerCase())) continue;
      }
      results.push({
        voteItemId: item.id,
        personName: entity.personName,
        actionType: entity.actionType,
        position: entity.position ?? null,
        school: entity.schoolOrDepartment ?? null,
        meetingDate: item.meeting?.date ? item.meeting.date.toISOString().slice(0, 10) : "",
      });
    }
  }

  return results;
};

export const getExecutiveSessionSummaries = async (reasonFilter?: string): Promise<ChatExecutiveSessionSummary[]> => {
  const normalizedFilter = normalizeWhitespace(reasonFilter ?? "").toLowerCase();
  const items = await db.query.voteItems.findMany({
    where: sql`${schema.voteItems.executiveSessionReason} IS NOT NULL AND ${schema.voteItems.executiveSessionReason} <> ''`,
    with: {
      meeting: { columns: { date: true, title: true } },
    },
  });

  return sortVoteItemsByMeetingDateDesc(items)
    .filter((item) => {
      if (!normalizedFilter) return true;
      return (item.executiveSessionReason ?? "").toLowerCase().includes(normalizedFilter);
    })
    .map((item) => ({
      voteItemId: item.id,
      itemTitle: sanitizePublicVoteDisplayText(item.itemTitle),
      meetingDate: item.meeting?.date ? item.meeting.date.toISOString().slice(0, 10) : "",
      meetingTitle: item.meeting?.title ?? "Needs review",
      reason: sanitizePublicVoteDisplayText(item.executiveSessionReason),
      motionMadeBy: getNeutralPublicPersonName(item.motionMadeBy ?? null),
      motionSecondedBy: getNeutralPublicPersonName(item.motionSecondedBy ?? null),
    }));
};

// Re-export canonicalBoardMembers so chatService can use it without touching boardVotes directly
export { canonicalBoardMembers };
