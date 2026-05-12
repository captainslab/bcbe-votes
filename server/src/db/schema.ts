import { relations } from "drizzle-orm";
import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export type PersonnelAction = {
  personName: string;
  actionType: "appointment" | "resignation" | "retirement" | "termination" | "transfer" | "leave" | "other";
  position: string | null;
  schoolOrDepartment: string | null;
  replacing: string | null;
  effectiveDate: string | null;
  classification: "classified" | "certified" | "administrative" | null;
};

export type PropertyAction = {
  actionType: "purchase" | "sale" | "lease" | "easement" | "conveyance" | "construction" | "renovation" | "agreement" | "survey" | "other";
  partyName: string | null;
  location: string | null;
  address: string | null;
  statedUse: string | null;
  term: string | null;
  effectiveDate: string | null;
};

export const boards = pgTable("boards", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  subdomain: text("subdomain").notNull().unique(),
  state: text("state"),
  simbliSiteId: text("simbli_site_id"),
  description: text("description"),
  logoUrl: text("logo_url"),
  status: text("status").notNull().default("live"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const ingestionStatusEnum = pgEnum("ingestion_status", [
  "pending",
  "in_progress",
  "completed",
  "failed",
  "partial",
]);

export const verificationStatusEnum = pgEnum("verification_status", [
  "unverified",
  "needs_review",
  "verified",
  "flagged",
]);

export const voteValueEnum = pgEnum("vote_value", ["yes", "no", "abstain", "recused", "absent"]);

export const boardMembers = pgTable(
  "board_members",
  {
    id: serial("id").primaryKey(),
    boardId: integer("board_id").references(() => boards.id),
    name: text("name").notNull(),
    district: text("district"),
    aliases: jsonb("aliases").$type<string[]>().default([]).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    nameUnique: uniqueIndex("board_member_name_unique").on(table.name),
  }),
);

export const meetings = pgTable("meetings", {
  id: serial("id").primaryKey(),
  boardId: integer("board_id").references(() => boards.id),
  date: timestamp("date", { withTimezone: true }).notNull(),
  title: text("title").notNull(),
  type: text("type").notNull(),
  simbliSiteId: text("simbli_site_id").default("200015").notNull(),
  simbliId: text("simbli_id").notNull().unique(),
  sourceUrl: text("source_url").notNull(),
  minutesUrl: text("minutes_url"),
  ingestionStatus: ingestionStatusEnum("ingestion_status").default("pending").notNull(),
  verificationStatus: verificationStatusEnum("verification_status")
    .default("unverified")
    .notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const voteItems = pgTable(
  "vote_items",
  {
    id: serial("id").primaryKey(),
    meetingId: integer("meeting_id")
      .references(() => meetings.id, { onDelete: "cascade" })
      .notNull(),
    agendaSection: text("agenda_section"),
    itemTitle: text("item_title").notNull(),
    summaryText: text("summary_text"),
    summarySource: text("summary_source"),
    summaryConfidenceScore: numeric("summary_confidence_score", { precision: 5, scale: 2 }),
    motionText: text("motion_text"),
    motionMadeBy: text("motion_made_by"),
    motionMadeByMemberId: integer("motion_made_by_member_id").references(() => boardMembers.id),
    motionSecondedBy: text("motion_seconded_by"),
    motionSecondedByMemberId: integer("motion_seconded_by_member_id").references(() => boardMembers.id),
    result: text("result"),
    isNonUnanimous: boolean("is_non_unanimous").default(false).notNull(),
    voteTally: jsonb("vote_tally").$type<Record<string, number>>().default({}).notNull(),
    sourceExcerpt: text("source_excerpt"),
    contentText: text("content_text"),
    personnelEntities: jsonb("personnel_entities").$type<PersonnelAction[] | null>(),
    propertyEntities: jsonb("property_entities").$type<PropertyAction[] | null>(),
    verificationStatus: verificationStatusEnum("verification_status")
      .default("unverified")
      .notNull(),
    detectedPattern: text("detected_pattern"),
    confidenceScore: numeric("confidence_score", { precision: 5, scale: 2 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    uniquePerMeeting: uniqueIndex("vote_item_meeting_title_unique").on(
      table.meetingId,
      table.itemTitle,
      table.motionText,
    ),
  }),
);

export const voteRecords = pgTable(
  "vote_records",
  {
    id: serial("id").primaryKey(),
    voteItemId: integer("vote_item_id")
      .references(() => voteItems.id, { onDelete: "cascade" })
      .notNull(),
    boardMemberId: integer("board_member_id").references(() => boardMembers.id, {
      onDelete: "set null",
    }),
    voteValue: voteValueEnum("vote_value").notNull(),
  },
  (table) => ({
    uniqueVote: uniqueIndex("vote_record_unique").on(table.voteItemId, table.boardMemberId),
  }),
);

export const importLogs = pgTable("import_logs", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  meetingsProcessed: integer("meetings_processed").default(0).notNull(),
  votesCreated: integer("votes_created").default(0).notNull(),
  recordsFlagged: integer("records_flagged").default(0).notNull(),
  errorSummary: text("error_summary"),
});

export const districtRequests = pgTable(
  "district_requests",
  {
    id: serial("id").primaryKey(),
    boardName: text("board_name").notNull(),
    state: text("state").notNull(),
    email: text("email").notNull(),
    type: text("type").notNull(), // "resident" | "operator"
    name: text("name"),
    role: text("role"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    uniqueEmailBoard: uniqueIndex("district_request_email_board_unique").on(table.email, table.boardName),
  }),
);

export const organizations = pgTable("organizations", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  contactName: text("contact_name").notNull(),
  contactEmail: text("contact_email").notNull(),
  stripeCustomerId: text("stripe_customer_id"),
  bulkOrderId: text("bulk_order_id"),
  totalPaid: integer("total_paid").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const boardSubmissions = pgTable("board_submissions", {
  id: serial("id").primaryKey(),
  boardName: text("board_name").notNull(),
  state: text("state").notNull(),
  submitterName: text("submitter_name").notNull(),
  submitterEmail: text("submitter_email").notNull(),
  slug: text("slug").notNull().unique(),
  goalAmount: integer("goal_amount").default(500).notNull(),
  pledgedAmount: integer("pledged_amount").default(25).notNull(), // starts at 25 from submission fee
  status: text("status").default("active").notNull(), // active | funded | onboarding | live
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  organizationId: integer("organization_id").references(() => organizations.id),
  customGoalAmount: integer("custom_goal_amount"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const boardPledges = pgTable(
  "board_pledges",
  {
    id: serial("id").primaryKey(),
    boardSubmissionId: integer("board_submission_id")
      .references(() => boardSubmissions.id, { onDelete: "cascade" })
      .notNull(),
    pledgerName: text("pledger_name").notNull(),
    pledgerEmail: text("pledger_email").notNull(),
    amount: integer("amount").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    uniquePledge: uniqueIndex("board_pledge_email_board_unique").on(
      table.pledgerEmail,
      table.boardSubmissionId,
    ),
  }),
);

export const boardRelations = relations(boards, ({ many }) => ({
  meetings: many(meetings),
  boardMembers: many(boardMembers),
}));

export const boardMemberRelations = relations(boardMembers, ({ one, many }) => ({
  board: one(boards, {
    fields: [boardMembers.boardId],
    references: [boards.id],
  }),
  voteRecords: many(voteRecords),
  motionMade: many(voteItems, { relationName: "motion_made_by_member_id" }),
  motionSeconded: many(voteItems, { relationName: "motion_seconded_by_member_id" }),
}));

export const meetingRelations = relations(meetings, ({ one, many }) => ({
  board: one(boards, {
    fields: [meetings.boardId],
    references: [boards.id],
  }),
  voteItems: many(voteItems),
}));

export const voteItemRelations = relations(voteItems, ({ one, many }) => ({
  meeting: one(meetings, {
    fields: [voteItems.meetingId],
    references: [meetings.id],
  }),
  motionMadeByMember: one(boardMembers, {
    fields: [voteItems.motionMadeByMemberId],
    references: [boardMembers.id],
    relationName: "motion_made_by_member_id",
  }),
  motionSecondedByMember: one(boardMembers, {
    fields: [voteItems.motionSecondedByMemberId],
    references: [boardMembers.id],
    relationName: "motion_seconded_by_member_id",
  }),
  voteRecords: many(voteRecords),
}));

export const voteRecordRelations = relations(voteRecords, ({ one }) => ({
  voteItem: one(voteItems, {
    fields: [voteRecords.voteItemId],
    references: [voteItems.id],
  }),
  boardMember: one(boardMembers, {
    fields: [voteRecords.boardMemberId],
    references: [boardMembers.id],
  }),
}));
