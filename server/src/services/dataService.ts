import { eq, ilike, or, sql } from "drizzle-orm";
import { db, schema } from "../db";
import {
  buildMemberNoVoteItems,
  buildSourceAuditInfo,
  categorizeVoteItemText,
  getCanonicalBoardMemberName,
  getNeutralPublicPersonName,
  sanitizePublicVoteDisplayText,
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
  };
};

export const listMeetings = async (limit = 200, offset = 0) => {
  const meetings = await db.query.meetings.findMany({
    limit,
    offset,
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

export const listVotes = async (nonUnanimousOnly = true, limit = 5000, offset = 0) => {
  const votes = await db.query.voteItems.findMany({
    where: nonUnanimousOnly ? eq(schema.voteItems.isNonUnanimous, true) : undefined,
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

export const listMembers = async () => {
  const members = await db.query.boardMembers.findMany({
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
    orderBy: (vote, { desc }) => [desc(vote.createdAt)],
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
        voteRecords: item.voteRecords.map((record) => ({
          boardMember: { name: record.boardMember?.name ?? null },
          voteValue: record.voteValue,
        })),
      };
    }),
  );
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
