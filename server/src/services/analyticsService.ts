import { and, count, desc, eq } from "drizzle-orm";
import { db, schema } from "../db";

type MemberStats = {
  memberId: number;
  name: string;
  totals: Record<string, number>;
  dissentCount: number;
  alignmentCount: number;
  totalVotes: number;
  unanimousParticipation: number;
  nonUnanimousParticipation: number;
};

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
      voteValue: schema.voteRecords.voteValue,
      voteItemId: schema.voteRecords.voteItemId,
      isNonUnanimous: schema.voteItems.isNonUnanimous,
      voteTally: schema.voteItems.voteTally,
    })
    .from(schema.voteRecords)
    .leftJoin(schema.voteItems, eq(schema.voteRecords.voteItemId, schema.voteItems.id));

  const members = await db.select().from(schema.boardMembers);

  const memberStats = new Map<number, MemberStats>();
  members.forEach((m) =>
    memberStats.set(m.id, {
      memberId: m.id,
      name: m.name,
      totals: { yes: 0, no: 0, abstain: 0, recused: 0, absent: 0 },
      dissentCount: 0,
      alignmentCount: 0,
      totalVotes: 0,
      unanimousParticipation: 0,
      nonUnanimousParticipation: 0,
    }),
  );

  memberVoteRows.forEach((row) => {
    if (row.memberId == null) return;
    const stats = memberStats.get(row.memberId);
    if (!stats) return;
    stats.totalVotes += 1;
    stats.totals[row.voteValue] = (stats.totals[row.voteValue] ?? 0) + 1;
    if (row.isNonUnanimous) {
      stats.nonUnanimousParticipation += 1;
    } else {
      stats.unanimousParticipation += 1;
    }
    const majority = getMajorityVote(row.voteTally ?? {});
    if (majority) {
      if (row.voteValue === majority) {
        stats.alignmentCount += 1;
      } else {
        stats.dissentCount += 1;
      }
    }
  });

  const dissentLeaderboard = Array.from(memberStats.values())
    .map((s) => ({
      memberId: s.memberId,
      name: s.name,
      dissentCount: s.dissentCount,
      totalVotes: s.totalVotes,
      dissentRate: s.totalVotes ? s.dissentCount / s.totalVotes : 0,
    }))
    .sort((a, b) => b.dissentRate - a.dissentRate)
    .slice(0, 5);

  const yesLeaderboard = Array.from(memberStats.values())
    .map((s) => ({
      memberId: s.memberId,
      name: s.name,
      yesRate: s.totalVotes ? (s.totals.yes ?? 0) / s.totalVotes : 0,
      yesCount: s.totals.yes ?? 0,
      totalVotes: s.totalVotes,
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
      voteValue: schema.voteRecords.voteValue,
      voteItemId: schema.voteRecords.voteItemId,
      isNonUnanimous: schema.voteItems.isNonUnanimous,
      voteTally: schema.voteItems.voteTally,
    })
    .from(schema.voteRecords)
    .leftJoin(schema.voteItems, eq(schema.voteRecords.voteItemId, schema.voteItems.id));
  const members = await db.select().from(schema.boardMembers);

  const stats = new Map<number, MemberStats>();
  members.forEach((m) =>
    stats.set(m.id, {
      memberId: m.id,
      name: m.name,
      totals: { yes: 0, no: 0, abstain: 0, recused: 0, absent: 0 },
      dissentCount: 0,
      alignmentCount: 0,
      totalVotes: 0,
      unanimousParticipation: 0,
      nonUnanimousParticipation: 0,
    }),
  );

  memberVoteRows.forEach((row) => {
    if (row.memberId == null) return;
    const s = stats.get(row.memberId);
    if (!s) return;
    s.totalVotes += 1;
    s.totals[row.voteValue] = (s.totals[row.voteValue] ?? 0) + 1;
    if (row.isNonUnanimous) s.nonUnanimousParticipation += 1;
    else s.unanimousParticipation += 1;
    const majority = getMajorityVote(row.voteTally ?? {});
    if (majority) {
      if (row.voteValue === majority) s.alignmentCount += 1;
      else s.dissentCount += 1;
    }
  });

  return Array.from(stats.values()).map((s) => ({
    memberId: s.memberId,
    name: s.name,
    totalVotes: s.totalVotes,
    yesCount: s.totals.yes ?? 0,
    noCount: s.totals.no ?? 0,
    abstainCount: s.totals.abstain ?? 0,
    recusedCount: s.totals.recused ?? 0,
    absentCount: s.totals.absent ?? 0,
    dissentCount: s.dissentCount,
    dissentRate: s.totalVotes ? s.dissentCount / s.totalVotes : 0,
    majorityAlignmentRate: s.totalVotes ? s.alignmentCount / s.totalVotes : 0,
    unanimousParticipation: s.unanimousParticipation,
    nonUnanimousParticipation: s.nonUnanimousParticipation,
  }));
};

export const getPairwiseAlignment = async () => {
  const records = await db
    .select({
      voteItemId: schema.voteRecords.voteItemId,
      memberId: schema.voteRecords.boardMemberId,
      voteValue: schema.voteRecords.voteValue,
    })
    .from(schema.voteRecords);

  const byVoteItem = new Map<number, { memberId: number; voteValue: string }[]>();
  records.forEach((r) => {
    if (r.memberId == null) return;
    const arr = byVoteItem.get(r.voteItemId) ?? [];
    arr.push({ memberId: r.memberId, voteValue: r.voteValue });
    byVoteItem.set(r.voteItemId, arr);
  });

  const pairStats = new Map<string, { same: number; diff: number }>();

  byVoteItem.forEach((votes) => {
    for (let i = 0; i < votes.length; i += 1) {
      for (let j = i + 1; j < votes.length; j += 1) {
        const a = votes[i];
        const b = votes[j];
        if (!a || !b) continue;
        const key = `${Math.min(a.memberId, b.memberId)}-${Math.max(a.memberId, b.memberId)}`;
        const record = pairStats.get(key) ?? { same: 0, diff: 0 };
        if (a.voteValue === b.voteValue) record.same += 1;
        else record.diff += 1;
        pairStats.set(key, record);
      }
    }
  });

  return Array.from(pairStats.entries()).map(([key, value]) => {
    const [a, b] = key.split("-").map(Number);
    const total = value.same + value.diff;
    return {
      memberAId: a,
      memberBId: b,
      sameVotes: value.same,
      differentVotes: value.diff,
      overlap: total,
      alignmentRate: total ? value.same / total : 0,
      splitRate: total ? value.diff / total : 0,
    };
  });
};

export const getMemberAlignment = async (memberId: number) => {
  const pairs = await getPairwiseAlignment();
  return pairs.filter((p) => p.memberAId === memberId || p.memberBId === memberId);
};

export const getRecentVotes = async (limit = 10) => {
  const votes = await db.query.voteItems.findMany({
    limit,
    orderBy: (v, { desc: orderDesc }) => [orderDesc(v.createdAt)],
    with: {
      meeting: true,
    },
  });
  return votes;
};
