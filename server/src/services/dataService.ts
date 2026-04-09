import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db, schema } from "../db";
import { normalizeWhitespace } from "../utils/text";

export const listMeetings = async (limit = 50, offset = 0) => {
  return db.query.meetings.findMany({
    limit,
    offset,
    orderBy: (m, { desc: orderDesc }) => [orderDesc(m.date)],
  });
};

export const getMeeting = async (id: number) => {
  return db.query.meetings.findFirst({
    where: eq(schema.meetings.id, id),
    with: {
      voteItems: {
        with: {
          voteRecords: true,
        },
      },
    },
  });
};

export const listVotes = async (nonUnanimousOnly = true, limit = 50, offset = 0) => {
  return db.query.voteItems.findMany({
    where: nonUnanimousOnly ? eq(schema.voteItems.isNonUnanimous, true) : undefined,
    limit,
    offset,
    orderBy: (v, { desc: orderDesc }) => [orderDesc(v.createdAt)],
    with: {
      meeting: true,
    },
  });
};

export const getVote = async (id: number) => {
  return db.query.voteItems.findFirst({
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
};

export const listMembers = async () => {
  return db.query.boardMembers.findMany({
    orderBy: (m, { asc }) => [asc(m.name)],
  });
};

export const getMember = async (id: number) => {
  return db.query.boardMembers.findFirst({
    where: eq(schema.boardMembers.id, id),
  });
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
