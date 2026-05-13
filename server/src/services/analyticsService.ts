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
  executiveSessionReason?: string | null;
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
    executiveSessionReason: vote.executiveSessionReason ?? null,
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

  const [execSessionCount] = await db
    .select({ count: count() })
    .from(schema.voteItems)
    .innerJoin(schema.meetings, eq(schema.voteItems.meetingId, schema.meetings.id))
    .where(
      sql`${schema.voteItems.itemTitle} ILIKE '%executive session%'
        AND ${schema.meetings.date} >= NOW() - INTERVAL '1 year'`,
    );

  const transcriptStatsRow = await db.execute(
    sql`
      SELECT
        COUNT(*) FILTER (WHERE exec_session_detected = true)::int AS exec_session_meetings,
        COUNT(DISTINCT meeting_id) FILTER (
          WHERE exec_session_detected = true
            AND meeting_date >= NOW() - INTERVAL '1 year'
        )::int AS exec_session_past_year,
        COALESCE(SUM(jsonb_array_length(voice_votes)) FILTER (WHERE voice_votes IS NOT NULL AND jsonb_array_length(voice_votes) > 0), 0)::int AS total_voice_votes,
        COALESCE(SUM(jsonb_array_length(motions_detected)) FILTER (WHERE motions_detected IS NOT NULL AND jsonb_array_length(motions_detected) > 0), 0)::int AS total_motions
      FROM meeting_transcripts
    `,
  );
  const tRow = transcriptStatsRow.rows[0] as {
    exec_session_meetings: number;
    exec_session_past_year: number;
    total_voice_votes: number;
    total_motions: number;
  } | undefined;

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
    executiveSessionCount: Number(execSessionCount?.count ?? 0),
    transcriptExecSessionCount: Number(tRow?.exec_session_past_year ?? 0),
    totalVoiceVotesTriggers: Number(tRow?.total_voice_votes ?? 0),
    totalMotionsDetected: Number(tRow?.total_motions ?? 0),
    dissentLeaderboard,
    yesLeaderboard,
  };
};

export type ExecSessionMeetingSummary = {
  meetingId: number | null;
  date: string | null;
  videoTitle: string;
  blockCount: number;
  reasons: string[];
};

export type ExecSessionSummaryResult = {
  totalDetected: number;
  pastYearCount: number;
  latestMeeting: ExecSessionMeetingSummary | null;
  meetings: ExecSessionMeetingSummary[];
};

export const getExecSessionSummary = async (): Promise<ExecSessionSummaryResult> => {
  const rows = await db.execute(
    sql`
      SELECT
        mt.meeting_id,
        mt.video_title,
        mt.meeting_date,
        mt.exec_session_context
      FROM meeting_transcripts mt
      WHERE mt.exec_session_detected = true
      ORDER BY mt.meeting_date DESC NULLS LAST
    `,
  );

  type RawExecRow = {
    meeting_id: number | null;
    video_title: string;
    meeting_date: Date | string | null;
    exec_session_context: unknown;
  };

  const allRows = rows.rows as RawExecRow[];

  const toDateStr = (value: Date | string | null): string | null => {
    if (!value) return null;
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return String(value).slice(0, 10);
  };

  const now = new Date();
  const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());

  const meetings: ExecSessionMeetingSummary[] = allRows.map((row) => {
    const ctx = Array.isArray(row.exec_session_context)
      ? (row.exec_session_context as Array<{ reasons?: string[] }>)
      : [];
    const reasons = ctx
      .flatMap((b) => b.reasons ?? [])
      .filter((r, i, arr) => arr.indexOf(r) === i);
    return {
      meetingId: row.meeting_id ?? null,
      date: toDateStr(row.meeting_date),
      videoTitle: row.video_title,
      blockCount: ctx.length,
      reasons,
    };
  });

  const pastYearMeetings = meetings.filter((m) => {
    if (!m.date) return false;
    return new Date(m.date) >= oneYearAgo;
  });

  return {
    totalDetected: meetings.length,
    pastYearCount: pastYearMeetings.length,
    latestMeeting: meetings[0] ?? null,
    meetings,
  };
};

function tsToSeconds(time: string): number | null {
  const parts = time.split(":").map(Number);
  if (parts.some((p) => isNaN(p))) return null;
  if (parts.length === 3) return (parts[0] ?? 0) * 3600 + (parts[1] ?? 0) * 60 + (parts[2] ?? 0);
  if (parts.length === 2) return (parts[0] ?? 0) * 60 + (parts[1] ?? 0);
  return null;
}

const FILLER_WORDS = new Set(["a", "an", "on", "so", "in", "it", "is", "by", "to", "the", "and", "or"]);
function isName(word: string | undefined): boolean {
  return !!word && word.length >= 3 && !FILLER_WORDS.has(word.toLowerCase());
}

function parseMotionActors(context: string): { movedBy: string | null; secondedBy: string | null } {
  const motionAndSecond = /motion by (\w+)[,\s]+(?:and\s+)?second(?:ed)? by (\w+)/i.exec(context);
  if (motionAndSecond && isName(motionAndSecond[1]) && isName(motionAndSecond[2])) {
    return { movedBy: motionAndSecond[1] ?? null, secondedBy: motionAndSecond[2] ?? null };
  }
  const motionBy = /(?:motion|move)\s+by\s+(\w+)/i.exec(context);
  const secondedBy = /second(?:ed)?\s+by\s+(\w+)/i.exec(context);
  const xSeconds = /\b([A-Z]\w{2,})\s+seconds\b/.exec(context);
  return {
    movedBy: isName(motionBy?.[1]) ? (motionBy![1] ?? null) : null,
    secondedBy: isName(secondedBy?.[1])
      ? (secondedBy![1] ?? null)
      : isName(xSeconds?.[1])
        ? (xSeconds![1] ?? null)
        : null,
  };
}

export type ExecSessionBlock = {
  time: string;
  context: string;
  reasons: string[];
  movedBy: string | null;
  secondedBy: string | null;
  timestampUrl: string | null;
};

export type ExecSessionDetailRow = {
  meetingId: number | null;
  videoId: string;
  videoTitle: string;
  date: string | null;
  voiceVoteCount: number;
  motionCount: number;
  blocks: ExecSessionBlock[];
};

export const getExecSessionDetail = async (): Promise<ExecSessionDetailRow[]> => {
  const rows = await db.execute(
    sql`
      SELECT
        mt.meeting_id,
        mt.video_id,
        mt.video_title,
        mt.meeting_date,
        mt.exec_session_context,
        jsonb_array_length(COALESCE(mt.voice_votes, '[]'::jsonb)) AS voice_vote_count,
        jsonb_array_length(COALESCE(mt.motions_detected, '[]'::jsonb)) AS motion_count
      FROM meeting_transcripts mt
      WHERE mt.exec_session_detected = true
      ORDER BY mt.meeting_date DESC NULLS LAST
    `,
  );

  type RawRow = {
    meeting_id: number | null;
    video_id: string;
    video_title: string;
    meeting_date: Date | string | null;
    exec_session_context: unknown;
    voice_vote_count: number;
    motion_count: number;
  };

  const toDateStr = (value: Date | string | null): string | null => {
    if (!value) return null;
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return String(value).slice(0, 10);
  };

  return (rows.rows as RawRow[]).map((row) => {
    const ctx = Array.isArray(row.exec_session_context)
      ? (row.exec_session_context as Array<{ time: string; context: string; reasons?: string[] }>)
      : [];
    const blocks: ExecSessionBlock[] = ctx.map((b) => {
      const actors = parseMotionActors(b.context ?? "");
      const secs = tsToSeconds(b.time ?? "");
      return {
        time: b.time ?? "",
        context: b.context ?? "",
        reasons: b.reasons ?? [],
        movedBy: actors.movedBy,
        secondedBy: actors.secondedBy,
        timestampUrl:
          row.video_id && secs !== null
            ? `https://youtube.com/watch?v=${row.video_id}&t=${secs}`
            : null,
      };
    });
    return {
      meetingId: row.meeting_id ?? null,
      videoId: row.video_id,
      videoTitle: row.video_title,
      date: toDateStr(row.meeting_date),
      voiceVoteCount: Number(row.voice_vote_count ?? 0),
      motionCount: Number(row.motion_count ?? 0),
      blocks,
    };
  });
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

  const members = await db.select({ id: schema.boardMembers.id, name: schema.boardMembers.name, isActive: schema.boardMembers.isActive }).from(schema.boardMembers);
  const isActiveById = new Map(members.map((m) => [m.id, m.isActive]));
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
      isActive: isActiveById.get(stat.memberId) ?? true,
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
    with: {
      meeting: true,
    },
  });

  votes.sort((a, b) => {
    const dateA = a.meeting?.date ? new Date(a.meeting.date).getTime() : 0;
    const dateB = b.meeting?.date ? new Date(b.meeting.date).getTime() : 0;
    if (dateB !== dateA) return dateB - dateA;
    return b.id - a.id;
  });

  return votes.slice(0, limit).map((vote) => enrichVoteItemAudit(vote));
};
