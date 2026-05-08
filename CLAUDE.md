# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

**Client (Vite + React, port 5173):**
```bash
cd client && npm run dev       # dev server (proxies /api → 4100)
cd client && npm run build     # production build
cd client && npm run lint      # ESLint
```

**Server (Express, port 4100):**
```bash
cd server && npm run dev       # tsx watch mode
cd server && npm run build     # compile to dist/
cd server && npm run typecheck # type check only (no test framework)
```

**Database:**
```bash
psql "$DATABASE_URL" -f server/drizzle/000_initial.sql  # initial schema
cd server && npm run db:generate   # generate Drizzle migrations
cd server && npm run db:push       # apply schema changes
cd server && npm run db:studio     # interactive Drizzle Studio
```

**Ingestion scripts (run from `server/`):**
```bash
npm run import:meetings            # fetch Simbli meeting listing
npm run import:meeting-detail      # import single meeting detail
npm run probe:minutes-votes        # probe vote extraction from minutes
npm run prove:minutes-votes        # validate vote extraction patterns
```

## Architecture

Monorepo with independent `client/` and `server/` packages. No shared package — shared types are duplicated or defined per side.

### Data flow

```
Simbli (eboard HTML) → ingestion/ fetchers → parsers → normalizers → PostgreSQL
                                                                         ↓
                                                               Express API (/api/*)
                                                                         ↓
                                                              React SPA (TanStack Query)
```

### Server (`server/src/`)

- **`app.ts`** — Express setup: Helmet, CORS, rate limiting, routes
- **`routes/public.ts`** — All public API endpoints
- **`routes/admin.ts`** — Ingestion trigger endpoints (Basic Auth)
- **`services/`** — `dataService` (queries), `analyticsService` (stats/alliances), `chatService` (AI Q&A via OpenRouter), `minutesVoteService` (vote extraction logic)
- **`ingestion/`** — Fetchers (Axios + Cheerio), parsers, normalizers, idempotent upsert workflow
- **`db/schema.ts`** — Drizzle schema: `board_members`, `meetings`, `vote_items`, `vote_records`, `import_logs`
- **`config/env.ts`** — Zod-validated env vars; fail-fast on startup if missing

### Client (`client/src/`)

- **`pages/`** — Dashboard, Votes, VoteDetail, Meetings, MeetingDetail, Members, MemberDetail, Alliances, Admin
- **`api/`** — Axios client + TanStack Query hooks
- **`components/`** — Shared UI + Layout

### Key data model notes

- `vote_items` has `confidence` and `low_confidence` flag — UI hides low-confidence votes by default
- `vote_records` stores per-member votes (Yes/No/Abstain/Recused/Absent)
- Every vote item must link back to `source_url` and `source_excerpt` for traceability
- Vote outcome is derived from tally, not raw result text from source

### Environment variables

See `.env.example`. Required: `NODE_ENV`, `PORT`, `DATABASE_URL`. Admin auth: `ADMIN_BASIC_USER` / `ADMIN_BASIC_PASS`. Optional AI: `OPENROUTER_API_KEY`.

### Production shape

Cloudflare → Nginx (reverse proxy) → Node API + local PostgreSQL on a VPS. See `docs/deployment-vps.md` and `deploy/` for example systemd service and Nginx config.
