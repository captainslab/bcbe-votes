CREATE TYPE "public"."ingestion_status" AS ENUM('pending', 'in_progress', 'completed', 'failed', 'partial');--> statement-breakpoint
CREATE TYPE "public"."verification_status" AS ENUM('unverified', 'needs_review', 'verified', 'flagged');--> statement-breakpoint
CREATE TYPE "public"."vote_value" AS ENUM('yes', 'no', 'abstain', 'recused', 'absent');--> statement-breakpoint
CREATE TABLE "board_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"board_id" integer,
	"name" text NOT NULL,
	"district" text,
	"aliases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "board_pledges" (
	"id" serial PRIMARY KEY NOT NULL,
	"board_submission_id" integer NOT NULL,
	"pledger_name" text NOT NULL,
	"pledger_email" text NOT NULL,
	"amount" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "board_submissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"board_name" text NOT NULL,
	"state" text NOT NULL,
	"submitter_name" text NOT NULL,
	"submitter_email" text NOT NULL,
	"slug" text NOT NULL,
	"goal_amount" integer DEFAULT 500 NOT NULL,
	"pledged_amount" integer DEFAULT 25 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"stripe_payment_intent_id" text,
	"organization_id" integer,
	"custom_goal_amount" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "board_submissions_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "boards" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"state" text NOT NULL,
	"simbli_site_id" text,
	"description" text,
	"status" text DEFAULT 'coming_soon' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "boards_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "district_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"board_name" text NOT NULL,
	"state" text NOT NULL,
	"email" text NOT NULL,
	"type" text NOT NULL,
	"name" text,
	"role" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"meetings_processed" integer DEFAULT 0 NOT NULL,
	"votes_created" integer DEFAULT 0 NOT NULL,
	"records_flagged" integer DEFAULT 0 NOT NULL,
	"error_summary" text
);
--> statement-breakpoint
CREATE TABLE "meetings" (
	"id" serial PRIMARY KEY NOT NULL,
	"board_id" integer,
	"date" timestamp with time zone NOT NULL,
	"title" text NOT NULL,
	"type" text NOT NULL,
	"simbli_site_id" text DEFAULT '200015' NOT NULL,
	"simbli_id" text NOT NULL,
	"source_url" text NOT NULL,
	"minutes_url" text,
	"ingestion_status" "ingestion_status" DEFAULT 'pending' NOT NULL,
	"verification_status" "verification_status" DEFAULT 'unverified' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meetings_simbli_id_unique" UNIQUE("simbli_id")
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"contact_name" text NOT NULL,
	"contact_email" text NOT NULL,
	"stripe_customer_id" text,
	"bulk_order_id" text,
	"total_paid" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vote_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"meeting_id" integer NOT NULL,
	"agenda_section" text,
	"item_title" text NOT NULL,
	"summary_text" text,
	"summary_source" text,
	"summary_confidence_score" numeric(5, 2),
	"motion_text" text,
	"motion_made_by" text,
	"motion_made_by_member_id" integer,
	"motion_seconded_by" text,
	"motion_seconded_by_member_id" integer,
	"result" text,
	"is_non_unanimous" boolean DEFAULT false NOT NULL,
	"vote_tally" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source_excerpt" text,
	"content_text" text,
	"personnel_entities" jsonb,
	"property_entities" jsonb,
	"verification_status" "verification_status" DEFAULT 'unverified' NOT NULL,
	"detected_pattern" text,
	"confidence_score" numeric(5, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vote_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"vote_item_id" integer NOT NULL,
	"board_member_id" integer,
	"vote_value" "vote_value" NOT NULL
);
--> statement-breakpoint
ALTER TABLE "board_members" ADD CONSTRAINT "board_members_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_pledges" ADD CONSTRAINT "board_pledges_board_submission_id_board_submissions_id_fk" FOREIGN KEY ("board_submission_id") REFERENCES "public"."board_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_submissions" ADD CONSTRAINT "board_submissions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vote_items" ADD CONSTRAINT "vote_items_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vote_items" ADD CONSTRAINT "vote_items_motion_made_by_member_id_board_members_id_fk" FOREIGN KEY ("motion_made_by_member_id") REFERENCES "public"."board_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vote_items" ADD CONSTRAINT "vote_items_motion_seconded_by_member_id_board_members_id_fk" FOREIGN KEY ("motion_seconded_by_member_id") REFERENCES "public"."board_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vote_records" ADD CONSTRAINT "vote_records_vote_item_id_vote_items_id_fk" FOREIGN KEY ("vote_item_id") REFERENCES "public"."vote_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vote_records" ADD CONSTRAINT "vote_records_board_member_id_board_members_id_fk" FOREIGN KEY ("board_member_id") REFERENCES "public"."board_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "board_member_name_unique" ON "board_members" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "board_pledge_email_board_unique" ON "board_pledges" USING btree ("pledger_email","board_submission_id");--> statement-breakpoint
CREATE UNIQUE INDEX "district_request_email_board_unique" ON "district_requests" USING btree ("email","board_name");--> statement-breakpoint
CREATE UNIQUE INDEX "vote_item_meeting_title_unique" ON "vote_items" USING btree ("meeting_id","item_title","motion_text");--> statement-breakpoint
CREATE UNIQUE INDEX "vote_record_unique" ON "vote_records" USING btree ("vote_item_id","board_member_id");