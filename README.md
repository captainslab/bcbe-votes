# BCBE Votes

Public-facing voter transparency platform for Baldwin County Board of Education. Tracks motions, voting records, alignment, and dissent with full source traceability pulled automatically from Simbli.

## Product direction

- Public record first, not commentary or campaign material.
- Scraper-first ingestion; no manual production entry.
- Every vote should expose a plain-language summary, original motion text, source excerpt, source URL, verification status, and detected pattern.
- Member analytics should emphasize yes rate, dissent rate, majority alignment, and pairwise alignment.
- The public UI should stay readable on desktop and mobile with cards, tables, and source-linked detail views.

## Tech stack

- Frontend: React (Vite + TypeScript + Tailwind)
- Backend: Node.js, Express 5, TypeScript
- Database: PostgreSQL + Drizzle ORM
- Scraper/Parser: Axios + Cheerio + resilient retry/backoff

## Quick start

1) Install prerequisites
- Node 20+
- PostgreSQL (running locally)

2) Configure environment
- Copy `.env.example` to `.env` at the repository root (used by the server) and set `DATABASE_URL`, `ADMIN_BASIC_USER`, `ADMIN_BASIC_PASS`, etc.
- Copy `client/.env.example` to `client/.env` if you want a custom API base URL.

3) Install dependencies
```bash
cd server && npm install
cd ../client && npm install
```

4) Apply the initial database schema
```bash
psql "$DATABASE_URL" -f server/drizzle/000_initial.sql
```

5) Run locally
- API: `cd server && npm run dev` (defaults to `http://localhost:4000`)
- Frontend: `cd client && npm run dev` (defaults to `http://localhost:5173`)

## API surface

Public
- `GET /api/health`
- `GET /api/meetings` / `GET /api/meetings/:id`
- `GET /api/votes` / `GET /api/votes/:id`
- `GET /api/members` / `GET /api/members/:id`
- `GET /api/stats`
- `GET /api/alliances`
- `GET /api/members/:id/alignment`

Admin (Basic Auth; automation only)
- `POST /api/admin/batch-fetch` `{ startMid?, endMid? }`
- `POST /api/admin/import-meeting/:simbliId`
- `POST /api/admin/reimport-meeting/:id`
- `GET /api/admin/import-logs`

## Security defaults

- Helmet, strict CORS, JSON/body limits, and rate limiting
- Centralized error handling with production-safe responses
- Pino request logging (toggle with `ENABLE_REQUEST_LOGS`)
- Basic Auth guard on admin routes
- Environment-based config validation (zod)

## Data model (Drizzle)

- `board_members` — name, district, aliases
- `meetings` — simbli ids, dates, status, source/minutes URLs
- `vote_items` — agenda section, motion, result, summaries, tallies, confidence, patterns
- `vote_records` — per-member votes (Yes/No/Abstain/Recused/Absent)
- `import_logs` — ingestion runs with counts/errors

## Scraper + parser

- Source: `https://simbli.eboardsolutions.com/SB_Meetings/SB_MeetingListing.aspx?S=200015`
- Detail: `https://simbli.eboardsolutions.com/SB_Meetings/ViewMeeting.aspx?S=200015&MID={id}`
- Layers: fetcher (timeouts + retry/backoff) → HTML parser (Cheerio) → normalization (vote value + names) → persistence (Drizzle) with idempotent upserts
- Import runs are logged in `import_logs`, tolerate partial failures, and are restartable by MID range or single MID.

## Frontend pages

- Dashboard: totals, non-unanimous count, dissent and yes-rate leaderboards, recent votes
- Votes & Vote detail: summary, motion text, vote grid, source excerpt, and official source
- Meetings & Meeting detail: meeting metadata with linked vote items and traceable source URLs
- Members & Member detail: per-member stats, yes rate, dissent rate, majority alignment, and pairwise alignment
- Alliances: pairwise alignment table with member names
- Admin: trigger automated imports (batch or single MID) with Basic Auth

## Frontend shell

- Civic, source-forward shell with persistent navigation and a dashboard hero.
- Default votes view is non-unanimous items.
- Vote and meeting detail pages preserve source excerpts and official URLs.
- Member and alliance views prioritize readable names over raw identifiers.

## Development scripts (server)

- `npm run dev` — start Express with tsx watcher
- `npm run typecheck` — TypeScript check
- `npm run build` — compile to `dist`
- `npm run import:meetings` — ingest the live BCBE Simbli meeting listing
- `npm run import:meetings -- --dry-run` — preview extracted meeting rows without writing
- `npm run db:generate` / `npm run db:push` — Drizzle kit helpers (requires DATABASE_URL)

## Ingestion status

- Meeting listing ingestion is live and idempotent.
- Minutes URL derivation and meeting detail parsing are still deferred.

## Production notes

- No manual data entry; all production data must come from the scraper/parser.
- Always store and show `source_url`, `source_excerpt`, and `verification_status` on the frontend.
- Keep Basic Auth credentials secret; rotate regularly.
