import { count, eq, sql } from "drizzle-orm";
import { db, schema } from "../db";
import {
  buildSourceAuditInfo,
  canonicalBoardMembers,
  categorizeVoteItemText,
  getCanonicalBoardMemberName,
  getNeutralPublicPersonName,
  sanitizePublicVoteDisplayText,
  type CanonicalBoardMemberName,
} from "../utils/boardVotes";

type MemberStats = {
  memberId: number;
  name: CanonicalBoardMemberName;
  totals: Record<string, number>;
  dissentCount: number;
  alignmentCount: number;
  totalVotes: number;
  unanimousParticipation: number;
  nonUnanimousParticipation: number;
  noAbstainByCategory: Map<string, number>;
};

type CanonicalMemberRef = {
  memberId: number;
  name: CanonicalBoardMemberName;
};

const createCanonicalMemberStats = (memberId: number, name: CanonicalBoardMemberName): MemberStats => ({
  memberId,
  name,
  totals: { yes: 0, no: 0, abstain: 0, recused: 0, absent: 0 },
  dissentCount: 0,
  alignmentCount: 0,
  totalVotes: 0,
  unanimousParticipation: 0,
  nonUnanimousParticipation: 0,
  noAbstainByCategory: new Map(),
});

const getMajorityVote = (tally: Record<string, number>) => {
  let max = 0;
  let majority: string | null = null;

  for (const [vote, value] of Object.entries(tally ?? {})) {
    if (value > max) {
      max = value;
      majority = vote;
    }
  }

  return majority;
};

const buildCanonicalMemberDirectory = (
  members: Array<{ id: number; name: string }>,
): Map<CanonicalBoardMemberName, CanonicalMemberRef> => {
  const directory = new Map<CanonicalBoardMemberName, CanonicalMemberRef>();

  members.forEach((member) => {
    const canonicalName = getCanonicalBoardMemberName(member.name);
    if (!canonicalName) return;

    const existing = directory.get(canonicalName);
    if (!existing || member.id < existing.memberId) {
      directory.set(canonicalName, { memberId: member.id, name: canonicalName });
    }
  });

  canonicalBoardMembers.forEach((name) => {
    if (!directory.has(name)) return;
  });

  return directory;
};

const getCanonicalMemberRef = (
  directory: Map<CanonicalBoardMemberName, CanonicalMemberRef>,
  rawName?: string | null,
) => {
  const canonicalName = getCanonicalBoardMemberName(rawName);
  if (!canonicalName) return null;
  return directory.get(canonicalName) ?? null;
};

const enrichVoteItemAudit = <T extends {
  itemTitle?: string | null;
  motionMadeBy?: string | null;
  motionSecondedBy?: string | null;
  motionText?: string | null;
  summaryText?: string | null;
  sourceExcerpt?: string | null;
  result?: string | null;
  meeting?: { sourceUrl?: string | null } | null;
}>(vote: T) => {
  const categoryInfo = categorizeVoteItemText({
    itemTitle: vote.itemTitle ?? null,
    motionText: vote.motionText ?? null,
    summaryText: vote.summaryText ?? null,
    sourceExcerpt: vote.sourceExcerpt ?? null,
  });
  const sourceInfo = buildSourceAuditInfo(vote.meeting?.sourceUrl ?? null);

  return {
    ...vote,
    itemTitle: sanitizePublicVoteDisplayText(vote.itemTitle),
    motionMadeBy: getNeutralPublicPersonName(vote.motionMadeBy ?? null),
    motionSecondedBy: getNeutralPublicPersonName(vote.motionSecondedBy ?? null),
    motionText: sanitizePublicVoteDisplayText(vote.motionText),
    summaryText: sanitizePublicVoteDisplayText(vote.summaryText),
    sourceExcerpt: sanitizePublicVoteDisplayText(vote.sourceExcerpt),
    result: sanitizePublicVoteDisplayText(vote.result, "strict-outcome"),
    category: categoryInfo.category,
    categoryConfidence: categoryInfo.categoryConfidence,
    sourceUrl: sourceInfo.sourceUrl,
    sourceAvailability: sourceInfo.sourceAvailability,
    sourceLabel: sourceInfo.sourceLabel,
  };
};

export const getSummaryStats = async () => {
  const [meetingsCount] = await db.select({ count: count() }).from(schema.meetings);
  const [voteItemsCount] = await db.select({ count: count() }).from(schema.voteItems);
  const [voteRecordsCount] = await db.select({ count: count() }).from(schema.voteRecords);
  const [nonUnanimousCount] = await db
    .select({ count: count() })
    .from(schema.voteItems)
    .where(eq(schema.voteItems.isNonUnanimous, true));

  const [needsReviewCount] = await db
    .select({
      count: count(),
    })
    .from(schema.voteItems)
    .where(
      sql`(
        ${schema.voteItems.verificationStatus} != 'verified'
        OR ${schema.voteItems.confidenceScore} IS NULL
        OR ${schema.voteItems.confidenceScore} < 0.6
      )`,
    );

  const memberVoteRows = await db
    .select({
      memberId: schema.voteRecords.boardMemberId,
      memberName: schema.boardMembers.name,
      voteValue: schema.voteRecords.voteValue,
      isNonUnanimous: schema.voteItems.isNonUnanimous,
      voteTally: schema.voteItems.voteTally,
    })
    .from(schema.voteRecords)
    .leftJoin(schema.voteItems, eq(schema.voteRecords.voteItemId, schema.voteItems.id))
    .leftJoin(schema.boardMembers, eq(schema.voteRecords.boardMemberId, schema.boardMembers.id));

  const members = await db.select({ id: schema.boardMembers.id, name: schema.boardMembers.name }).from(schema.boardMembers);
  const canonicalDirectory = buildCanonicalMemberDirectory(members);
  const memberStats = new Map<number, MemberStats>();

  Array.from(canonicalDirectory.values()).forEach((member) => {
    memberStats.set(member.memberId, createCanonicalMemberStats(member.memberId, member.name));
  });

  memberVoteRows.forEach((row) => {
    const memberRef = getCanonicalMemberRef(canonicalDirectory, row.memberName);
    if (!memberRef) return;

    const stats = memberStats.get(memberRef.memberId);
    if (!stats) return;

    stats.totalVotes += 1;
    stats.totals[row.voteValue] = (stats.totals[row.voteValue] ?? 0) + 1;
    if (row.isNonUnanimous) stats.nonUnanimousParticipation += 1;
    else stats.unanimousParticipation += 1;

    const majority = getMajorityVote(row.voteTally ?? {});
    if (!majority) return;
    if (row.voteValue === majority) stats.alignmentCount += 1;
    else stats.dissentCount += 1;
  });

  const dissentLeaderboard = Array.from(memberStats.values())
    .map((stats) => ({
      memberId: stats.memberId,
      name: stats.name,
      dissentCount: stats.dissentCount,
      totalVotes: stats.totalVotes,
      dissentRate: stats.totalVotes ? stats.dissentCount / stats.totalVotes : 0,
    }))
    .sort((a, b) => b.dissentRate - a.dissentRate)
    .slice(0, 5);

  const yesLeaderboard = Array.from(memberStats.values())
    .map((stats) => ({
      memberId: stats.memberId,
      name: stats.name,
      yesRate: stats.totalVotes ? (stats.totals.yes ?? 0) / stats.totalVotes : 0,
      yesCount: stats.totals.yes ?? 0,
      totalVotes: stats.totalVotes,
    }))
    .sort((a, b) => b.yesRate - a.yesRate)
    .slice(0, 5);

  return {
    totalMeetings: Number(meetingsCount?.count ?? 0),
    totalVotes: Number(voteItemsCount?.count ?? 0),
    totalVoteRecords: Number(voteRecordsCount?.count ?? 0),
    nonUnanimousCount: Number(nonUnanimousCount?.count ?? 0),
    needsReviewCount: Number(needsReviewCount?.count ?? 0),
    dissentLeaderboard,
    yesLeaderboard,
  };
};

export const getMemberStats = async () => {
  const memberVoteRows = await db
    .select({
      memberId: schema.voteRecords.boardMemberId,
      memberName: schema.boardMembers.name,
      voteValue: schema.voteRecords.voteValue,
      isNonUnanimous: schema.voteItems.isNonUnanimous,
      voteTally: schema.voteItems.voteTally,
      itemTitle: schema.voteItems.itemTitle,
      motionText: schema.voteItems.motionText,
      summaryText: schema.voteItems.summaryText,
      sourceExcerpt: schema.voteItems.sourceExcerpt,
    })
    .from(schema.voteRecords)
    .leftJoin(schema.voteItems, eq(schema.voteRecords.voteItemId, schema.voteItems.id))
    .leftJoin(schema.boardMembers, eq(schema.voteRecords.boardMemberId, schema.boardMembers.id));

  const members = await db.select({ id: schema.boardMembers.id, name: schema.boardMembers.name }).from(schema.boardMembers);
  const canonicalDirectory = buildCanonicalMemberDirectory(members);
  const stats = new Map<number, MemberStats>();

  Array.from(canonicalDirectory.values()).forEach((member) => {
    stats.set(member.memberId, createCanonicalMemberStats(member.memberId, member.name));
  });

  memberVoteRows.forEach((row) => {
    const memberRef = getCanonicalMemberRef(canonicalDirectory, row.memberName);
    if (!memberRef) return;

    const stat = stats.get(memberRef.memberId);
    if (!stat) return;

    stat.totalVotes += 1;
    stat.totals[row.voteValue] = (stat.totals[row.voteValue] ?? 0) + 1;
    if (row.isNonUnanimous) stat.nonUnanimousParticipation += 1;
    else stat.unanimousParticipation += 1;

    const majority = getMajorityVote(row.voteTally ?? {});
    if (!majority) return;
    if (row.voteValue === majority) stat.alignmentCount += 1;
    else stat.dissentCount += 1;

    if (row.voteValue === "no" || row.voteValue === "abstain") {
      const { category } = categorizeVoteItemText({
        itemTitle: row.itemTitle ?? null,
        motionText: row.motionText ?? null,
        summaryText: row.summaryText ?? null,
        sourceExcerpt: row.sourceExcerpt ?? null,
      });
      stat.noAbstainByCategory.set(category, (stat.noAbstainByCategory.get(category) ?? 0) + 1);
    }
  });

  return Array.from(stats.values()).map((stat) => {
    let topNoAbstainCategory: string | null = null;
    let topCount = 0;
    const topCats: string[] = [];
    stat.noAbstainByCategory.forEach((cnt, cat) => {
      if (cnt > topCount) {
        topCount = cnt;
        topCats.length = 0;
        topCats.push(cat);
      } else if (cnt === topCount && topCount > 0) {
        topCats.push(cat);
      }
    });
    if (topCats.length > 0) topNoAbstainCategory = topCats.join(" / ");

    return {
      memberId: stat.memberId,
      name: stat.name,
      totalVotes: stat.totalVotes,
      yesCount: stat.totals.yes ?? 0,
      noCount: stat.totals.no ?? 0,
      abstainCount: stat.totals.abstain ?? 0,
      recusedCount: stat.totals.recused ?? 0,
      absentCount: stat.totals.absent ?? 0,
      dissentCount: stat.dissentCount,
      dissentRate: stat.totalVotes ? stat.dissentCount / stat.totalVotes : 0,
      majorityAlignmentRate: stat.totalVotes ? stat.alignmentCount / stat.totalVotes : 0,
      unanimousParticipation: stat.unanimousParticipation,
      nonUnanimousParticipation: stat.nonUnanimousParticipation,
      topNoAbstainCategory,
    };
  });
};

type AlignmentSharedVote = {
  voteItemId: number;
  meetingId: number;
  meetingDate: string;
  meetingTitle: string;
  meetingType: string;
  displayText: string;
  itemTitle: string;
  motionText: string;
  summaryText: string;
  result: string;
  isNonUnanimous: boolean;
  category: string;
  categoryConfidence: number;
  verificationStatus: string;
  confidenceScore: number | string | null;
  sourceUrl: string | null;
  sourceAvailability: "available" | "unavailable";
  sourceLabel: string;
  memberAVote: string;
  memberBVote: string;
};

type PairwiseAlignmentAccumulator = {
  memberAId: number;
  memberBId: number;
  memberAName: CanonicalBoardMemberName;
  memberBName: CanonicalBoardMemberName;
  same: number;
  diff: number;
  sharedVotes: AlignmentSharedVote[];
};

const toDisplayVoteValue = (voteValue: string) => {
  if (!voteValue) return "Needs review";
  return `${voteValue.charAt(0).toUpperCase()}${voteValue.slice(1).toLowerCase()}`;
};

export const getPairwiseAlignment = async () => {
  const records = await db
    .select({
      voteItemId: schema.voteRecords.voteItemId,
      memberName: schema.boardMembers.name,
      voteValue: schema.voteRecords.voteValue,
      meetingId: schema.voteItems.meetingId,
      meetingDate: schema.meetings.date,
      meetingTitle: schema.meetings.title,
      meetingType: schema.meetings.type,
      meetingSourceUrl: schema.meetings.sourceUrl,
      itemTitle: schema.voteItems.itemTitle,
      motionText: schema.voteItems.motionText,
      summaryText: schema.voteItems.summaryText,
      sourceExcerpt: schema.voteItems.sourceExcerpt,
      result: schema.voteItems.result,
      isNonUnanimous: schema.voteItems.isNonUnanimous,
      verificationStatus: schema.voteItems.verificationStatus,
      confidenceScore: schema.voteItems.confidenceScore,
    })
    .from(schema.voteRecords)
    .leftJoin(schema.boardMembers, eq(schema.voteRecords.boardMemberId, schema.boardMembers.id))
    .leftJoin(schema.voteItems, eq(schema.voteRecords.voteItemId, schema.voteItems.id))
    .leftJoin(schema.meetings, eq(schema.voteItems.meetingId, schema.meetings.id));

  const members = await db.select({ id: schema.boardMembers.id, name: schema.boardMembers.name }).from(schema.boardMembers);
  const canonicalDirectory = buildCanonicalMemberDirectory(members);

  const byVoteItem = new Map<
    number,
    {
      meetingId: number;
      meetingDate: Date | null;
      meetingTitle: string | null;
      meetingType: string | null;
      meetingSourceUrl: string | null;
      itemTitle: string | null;
      motionText: string | null;
      summaryText: string | null;
      sourceExcerpt: string | null;
      result: string | null;
      isNonUnanimous: boolean;
      verificationStatus: string;
      confidenceScore: number | string | null;
      votes: Array<{ memberId: number; memberName: CanonicalBoardMemberName; voteValue: string }>;
    }
  >();

  records.forEach((record) => {
    const memberRef = getCanonicalMemberRef(canonicalDirectory, record.memberName);
    if (!memberRef) return;
    if (!record.voteItemId || !record.meetingId) return;

    const existing = byVoteItem.get(record.voteItemId) ?? {
      meetingId: record.meetingId,
      meetingDate: record.meetingDate ?? null,
      meetingTitle: record.meetingTitle ?? null,
      meetingType: record.meetingType ?? null,
      meetingSourceUrl: record.meetingSourceUrl ?? null,
      itemTitle: record.itemTitle ?? null,
      motionText: record.motionText ?? null,
      summaryText: record.summaryText ?? null,
      sourceExcerpt: record.sourceExcerpt ?? null,
      result: record.result ?? null,
      isNonUnanimous: Boolean(record.isNonUnanimous),
      verificationStatus: record.verificationStatus ?? "needs_review",
      confidenceScore: record.confidenceScore ?? null,
      votes: [],
    };

    if (existing.votes.some((entry) => entry.memberId === memberRef.memberId)) {
      byVoteItem.set(record.voteItemId, existing);
      return;
    }

    existing.votes.push({
      memberId: memberRef.memberId,
      memberName: memberRef.name,
      voteValue: record.voteValue,
    });
    byVoteItem.set(record.voteItemId, existing);
  });

  const pairStats = new Map<string, PairwiseAlignmentAccumulator>();

  byVoteItem.forEach((voteItem, voteItemId) => {
    const categoryInfo = categorizeVoteItemText({
      itemTitle: voteItem.itemTitle,
      motionText: voteItem.motionText,
      summaryText: voteItem.summaryText,
      sourceExcerpt: voteItem.sourceExcerpt,
    });
    const sourceInfo = buildSourceAuditInfo(voteItem.meetingSourceUrl);

    const itemTitle = sanitizePublicVoteDisplayText(voteItem.itemTitle);
    const motionText = sanitizePublicVoteDisplayText(voteItem.motionText);
    const summaryText = sanitizePublicVoteDisplayText(voteItem.summaryText);
    const result = sanitizePublicVoteDisplayText(voteItem.result, "strict-outcome");

    const displayText = [itemTitle, motionText, summaryText].find((value) => value && value !== "Needs review") ?? "Needs review";

    const orderedVotes = [...voteItem.votes].sort((a, b) => a.memberId - b.memberId);

    for (let i = 0; i < orderedVotes.length; i += 1) {
      for (let j = i + 1; j < orderedVotes.length; j += 1) {
        const a = orderedVotes[i];
        const b = orderedVotes[j];
        if (!a || !b) continue;

        const key = `${a.memberId}-${b.memberId}`;
        const accumulator =
          pairStats.get(key) ??
          ({
            memberAId: a.memberId,
            memberBId: b.memberId,
            memberAName: a.memberName,
            memberBName: b.memberName,
            same: 0,
            diff: 0,
            sharedVotes: [],
          } satisfies PairwiseAlignmentAccumulator);

        if (a.voteValue === b.voteValue) accumulator.same += 1;
        else accumulator.diff += 1;

        accumulator.sharedVotes.push({
          voteItemId,
          meetingId: voteItem.meetingId,
          meetingDate: voteItem.meetingDate ? voteItem.meetingDate.toISOString() : "",
          meetingTitle: voteItem.meetingTitle ?? "Needs review",
          meetingType: voteItem.meetingType ?? "Needs review",
          displayText,
          itemTitle,
          motionText,
          summaryText,
          result,
          isNonUnanimous: voteItem.isNonUnanimous,
          category: categoryInfo.category,
          categoryConfidence: categoryInfo.categoryConfidence,
          verificationStatus: voteItem.verificationStatus,
          confidenceScore: voteItem.confidenceScore,
          sourceUrl: sourceInfo.sourceUrl,
          sourceAvailability: sourceInfo.sourceAvailability,
          sourceLabel: sourceInfo.sourceLabel,
          memberAVote: toDisplayVoteValue(a.voteValue),
          memberBVote: toDisplayVoteValue(b.voteValue),
        });

        pairStats.set(key, accumulator);
      }
    }
  });

  return Array.from(pairStats.values()).map((pair) => {
    const overlap = pair.same + pair.diff;
    const categoriesRepresented = Array.from(
      new Set(pair.sharedVotes.map((vote) => vote.category || "Needs review")),
    ).sort((a, b) => a.localeCompare(b));

    return {
      memberAId: pair.memberAId,
      memberBId: pair.memberBId,
      memberAName: pair.memberAName,
      memberBName: pair.memberBName,
      sameVotes: pair.same,
      differentVotes: pair.diff,
      splitVotes: pair.diff,
      overlap,
      alignmentRate: overlap ? pair.same / overlap : 0,
      splitRate: overlap ? pair.diff / overlap : 0,
      categoriesRepresented,
      sharedVotes: pair.sharedVotes,
    };
  });
};

export const getMemberAlignment = async (memberId: number) => {
  const pairs = await getPairwiseAlignment();
  return pairs.filter((pair) => pair.memberAId === memberId || pair.memberBId === memberId);
};

export const getCategoryStats = async () => {
  const items = await db.query.voteItems.findMany({
    columns: {
      itemTitle: true,
      motionText: true,
      summaryText: true,
      sourceExcerpt: true,
      isNonUnanimous: true,
    },
    with: {
      meeting: { columns: { date: true } },
    },
  });

  const counts = new Map<string, { total: number; nonUnanimous: number; byYear: Map<number, number> }>();

  for (const item of items) {
    const { category } = categorizeVoteItemText({
      itemTitle: item.itemTitle ?? null,
      motionText: item.motionText ?? null,
      summaryText: item.summaryText ?? null,
      sourceExcerpt: item.sourceExcerpt ?? null,
    });

    if (!counts.has(category)) counts.set(category, { total: 0, nonUnanimous: 0, byYear: new Map() });
    const entry = counts.get(category)!;
    entry.total++;
    if (item.isNonUnanimous) entry.nonUnanimous++;

    const year = item.meeting?.date ? new Date(item.meeting.date).getFullYear() : null;
    if (year) entry.byYear.set(year, (entry.byYear.get(year) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([category, data]) => ({
      category,
      totalVotes: data.total,
      nonUnanimousVotes: data.nonUnanimous,
      byYear: Object.fromEntries(Array.from(data.byYear.entries()).sort((a, b) => a[0] - b[0])),
    }))
    .sort((a, b) => b.totalVotes - a.totalVotes);
};

export const getMemberCategoryStats = async (memberId: number) => {
  const [records, members] = await Promise.all([
    db
      .select({
        voteValue: schema.voteRecords.voteValue,
        memberName: schema.boardMembers.name,
        itemTitle: schema.voteItems.itemTitle,
        motionText: schema.voteItems.motionText,
        summaryText: schema.voteItems.summaryText,
        sourceExcerpt: schema.voteItems.sourceExcerpt,
      })
      .from(schema.voteRecords)
      .leftJoin(schema.boardMembers, eq(schema.voteRecords.boardMemberId, schema.boardMembers.id))
      .leftJoin(schema.voteItems, eq(schema.voteRecords.voteItemId, schema.voteItems.id)),
    db.select({ id: schema.boardMembers.id, name: schema.boardMembers.name }).from(schema.boardMembers),
  ]);

  const canonicalDirectory = buildCanonicalMemberDirectory(members);
  const canonicalEntry = Array.from(canonicalDirectory.values()).find((ref) => ref.memberId === memberId);
  if (!canonicalEntry) return [];

  const byCategory = new Map<string, { total: number; noVotes: number }>();

  for (const record of records) {
    if (getCanonicalBoardMemberName(record.memberName) !== canonicalEntry.name) continue;
    const { category } = categorizeVoteItemText({
      itemTitle: record.itemTitle ?? null,
      motionText: record.motionText ?? null,
      summaryText: record.summaryText ?? null,
      sourceExcerpt: record.sourceExcerpt ?? null,
    });
    const entry = byCategory.get(category) ?? { total: 0, noVotes: 0 };
    entry.total++;
    if (record.voteValue === "no") entry.noVotes++;
    byCategory.set(category, entry);
  }

  return Array.from(byCategory.entries())
    .map(([category, data]) => ({
      category,
      totalVotes: data.total,
      noVotes: data.noVotes,
    }))
    .sort((a, b) => b.totalVotes - a.totalVotes);
};

export const getRecentVotes = async (limit = 10) => {
  const votes = await db.query.voteItems.findMany({
    limit,
    orderBy: (vote, { desc: orderDesc }) => [orderDesc(vote.createdAt)],
    with: {
      meeting: true,
    },
  });

  return votes.map((vote) => enrichVoteItemAudit(vote));
};
