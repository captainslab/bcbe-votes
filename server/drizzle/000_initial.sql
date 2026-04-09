CREATE TYPE ingestion_status AS ENUM ('pending', 'in_progress', 'completed', 'failed', 'partial');
CREATE TYPE verification_status AS ENUM ('unverified', 'needs_review', 'verified', 'flagged');
CREATE TYPE vote_value AS ENUM ('yes', 'no', 'abstain', 'recused', 'absent');

CREATE TABLE board_members (
  id serial PRIMARY KEY,
  name text NOT NULL,
  district text,
  aliases jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT board_member_name_unique UNIQUE (name)
);

CREATE TABLE meetings (
  id serial PRIMARY KEY,
  date timestamptz NOT NULL,
  title text NOT NULL,
  type text NOT NULL,
  simbli_site_id text NOT NULL DEFAULT '200015',
  simbli_id text NOT NULL,
  source_url text NOT NULL,
  minutes_url text,
  ingestion_status ingestion_status NOT NULL DEFAULT 'pending',
  verification_status verification_status NOT NULL DEFAULT 'unverified',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meetings_simbli_id_unique UNIQUE (simbli_id)
);

CREATE TABLE vote_items (
  id serial PRIMARY KEY,
  meeting_id integer NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  agenda_section text,
  item_title text NOT NULL,
  summary_text text,
  summary_source text,
  summary_confidence_score numeric(5,2),
  motion_text text,
  motion_made_by text,
  motion_made_by_member_id integer REFERENCES board_members(id),
  motion_seconded_by text,
  motion_seconded_by_member_id integer REFERENCES board_members(id),
  result text,
  is_non_unanimous boolean NOT NULL DEFAULT false,
  vote_tally jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_excerpt text,
  verification_status verification_status NOT NULL DEFAULT 'unverified',
  detected_pattern text,
  confidence_score numeric(5,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vote_item_meeting_title_unique UNIQUE (meeting_id, item_title, motion_text)
);

CREATE TABLE vote_records (
  id serial PRIMARY KEY,
  vote_item_id integer NOT NULL REFERENCES vote_items(id) ON DELETE CASCADE,
  board_member_id integer NOT NULL REFERENCES board_members(id) ON DELETE SET NULL,
  vote_value vote_value NOT NULL,
  CONSTRAINT vote_record_unique UNIQUE (vote_item_id, board_member_id)
);

CREATE TABLE import_logs (
  id serial PRIMARY KEY,
  type text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  meetings_processed integer NOT NULL DEFAULT 0,
  votes_created integer NOT NULL DEFAULT 0,
  records_flagged integer NOT NULL DEFAULT 0,
  error_summary text
);
