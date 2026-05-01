import { count, eq } from "drizzle-orm";
import { db, schema } from "../db";
import {
  buildSourceAuditInfo,
  canonicalBoardMembers,
  categorizeVoteItemText,
  getCanonicalBoardMemberName,
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
  motionText?: string | null;
  summaryText?: string | null;
  sourceExcerpt?: string | null;
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
  });

  return Array.from(stats.values()).map((stat) => ({
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
  }));
};

export const getPairwiseAlignment = async () => {
  const records = await db
    .select({
      voteItemId: schema.voteRecords.voteItemId,
      memberId: schema.voteRecords.boardMemberId,
      memberName: schema.boardMembers.name,
      voteValue: schema.voteRecords.voteValue,
    })
    .from(schema.voteRecords)
    .leftJoin(schema.boardMembers, eq(schema.voteRecords.boardMemberId, schema.boardMembers.id));

  const members = await db.select({ id: schema.boardMembers.id, name: schema.boardMembers.name }).from(schema.boardMembers);
  const canonicalDirectory = buildCanonicalMemberDirectory(members);
  const byVoteItem = new Map<number, { memberId: number; voteValue: string }[]>();

  records.forEach((record) => {
    const memberRef = getCanonicalMemberRef(canonicalDirectory, record.memberName);
    if (!memberRef) return;

    const existing = byVoteItem.get(record.voteItemId) ?? [];
    if (existing.some((entry) => entry.memberId === memberRef.memberId)) return;

    existing.push({ memberId: memberRef.memberId, voteValue: record.voteValue });
    byVoteItem.set(record.voteItemId, existing);
  });

  const pairStats = new Map<string, { same: number; diff: number }>();

  byVoteItem.forEach((votes) => {
    for (let i = 0; i < votes.length; i += 1) {
      for (let j = i + 1; j < votes.length; j += 1) {
        const a = votes[i];
        const b = votes[j];
        if (!a || !b) continue;
        const key = `${Math.min(a.memberId, b.memberId)}-${Math.max(a.memberId, b.memberId)}`;
        const current = pairStats.get(key) ?? { same: 0, diff: 0 };
        if (a.voteValue === b.voteValue) current.same += 1;
        else current.diff += 1;
        pairStats.set(key, current);
      }
    }
  });

  return Array.from(pairStats.entries()).map(([key, value]) => {
    const [memberAId, memberBId] = key.split("-").map(Number);
    const overlap = value.same + value.diff;
    return {
      memberAId,
      memberBId,
      sameVotes: value.same,
      differentVotes: value.diff,
      overlap,
      alignmentRate: overlap ? value.same / overlap : 0,
      splitRate: overlap ? value.diff / overlap : 0,
    };
  });
};

export const getMemberAlignment = async (memberId: number) => {
  const pairs = await getPairwiseAlignment();
  return pairs.filter((pair) => pair.memberAId === memberId || pair.memberBId === memberId);
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
