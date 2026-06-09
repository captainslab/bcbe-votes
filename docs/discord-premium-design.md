# Discord Premium Role-Sync — Design Document

## Current State Assessment

### What exists today

The database has **no users, accounts, or premium tables**. There is no authentication layer for end users. The only access control is Basic Auth for admin ingestion endpoints (`ADMIN_BASIC_USER` / `ADMIN_BASIC_PASS`).

Existing tables: `board_members`, `meetings`, `vote_items`, `vote_records`, `import_logs`, `district_requests`, `board_submissions`, `board_pledges`.

Payment infrastructure exists via Stripe (one-time donations, board submission fees) but there is no subscription or entitlement concept attached to any user identity.

There is no Discord integration of any kind.

### What is missing

- User identity model (no logins)
- Premium entitlement concept
- Discord identity linkage
- Any role-gating on API endpoints or client routes

---

## Discord Role-Sync Agent Design

### Purpose

Members of the boardvotes.io Discord server who hold a designated "Premium" role should have that status reflected in the application database. A periodic sync agent fetches the current role-holders from the Discord API and upserts/revokes their access records accordingly.

### Required Discord Configuration

| Item | Description |
|------|-------------|
| Discord Application + Bot | Created at https://discord.com/developers/applications |
| Bot Token | Authorizes API calls; needs `Server Members Intent` |
| Guild (Server) ID | The numeric ID of the boardvotes.io Discord server |
| Premium Role ID | The numeric ID of the role that grants premium access |

The bot must be invited to the server with the `bot` scope and at minimum the `Read Members` permission. The `Server Members Intent` must be enabled in the Developer Portal under Bot > Privileged Gateway Intents.

### Required Environment Variables

```
DISCORD_BOT_TOKEN=        # Bot token from Developer Portal
DISCORD_GUILD_ID=         # Right-click the server → Copy Server ID (Developer Mode must be on)
DISCORD_PREMIUM_ROLE_ID=  # Right-click the role → Copy Role ID
```

Add these to `/home/jordan/bcbe-votes/.env` (and `.env.example` in the repo).

---

## Database Tables to Add

### `discord_members`

Tracks Discord users who have ever been seen with the premium role.

```sql
CREATE TABLE discord_members (
  id             SERIAL PRIMARY KEY,
  discord_id     TEXT NOT NULL UNIQUE,       -- Discord snowflake user ID
  username       TEXT,                        -- current Discord username
  avatar         TEXT,                        -- avatar hash for display
  first_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### `premium_access`

The entitlement record. One row per Discord member. Source of truth for whether a user currently has access.

```sql
CREATE TABLE premium_access (
  id                SERIAL PRIMARY KEY,
  discord_member_id INTEGER NOT NULL REFERENCES discord_members(id) ON DELETE CASCADE,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  granted_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at        TIMESTAMPTZ,              -- NULL while active
  grant_source      TEXT NOT NULL DEFAULT 'discord_role',  -- extensible
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX premium_access_discord_member_unique ON premium_access(discord_member_id);
```

### `premium_sync_logs`

Audit log for each sync run.

```sql
CREATE TABLE premium_sync_logs (
  id               SERIAL PRIMARY KEY,
  started_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at     TIMESTAMPTZ,
  members_fetched  INTEGER NOT NULL DEFAULT 0,  -- count from Discord API
  granted          INTEGER NOT NULL DEFAULT 0,  -- newly granted this run
  revoked          INTEGER NOT NULL DEFAULT 0,  -- newly revoked this run
  unchanged        INTEGER NOT NULL DEFAULT 0,  -- already correct, not touched
  error_summary    TEXT,
  success          BOOLEAN NOT NULL DEFAULT FALSE
);
```

---

## Sync Logic

```
1. Fetch all guild members with DISCORD_PREMIUM_ROLE_ID from Discord API
   (paginate: GET /guilds/{guild}/members?limit=1000&after={last_id})

2. Build a Set of discord_ids that currently hold the role.

3. For each discord_id in the set:
   - UPSERT into discord_members (update username, avatar, last_seen_at)
   - UPSERT into premium_access:
       - If no row: INSERT with is_active=TRUE, granted_at=NOW()
       - If row with is_active=FALSE: UPDATE is_active=TRUE, granted_at=NOW(), revoked_at=NULL
       - If row with is_active=TRUE: no-op (count as "unchanged")

4. For every premium_access row with is_active=TRUE whose discord_member_id is NOT in the current set:
   - UPDATE is_active=FALSE, revoked_at=NOW()
   - Count as "revoked"

5. INSERT a row into premium_sync_logs with the run summary.
```

This is fully idempotent. Running it twice in a row produces no mutations on the second pass.

---

## API Gating (Future Work)

Once premium_access exists, endpoints or client features that should be premium-only can check:

```sql
SELECT pa.is_active
FROM premium_access pa
JOIN discord_members dm ON dm.id = pa.discord_member_id
WHERE dm.discord_id = $1
  AND pa.is_active = TRUE;
```

The frontend would need a login step (Discord OAuth2) to establish which Discord user the browser session belongs to. That is out of scope for the sync agent but is the natural next step.

---

## Files Created / To Be Created

| Path | Purpose |
|------|---------|
| `docs/discord-premium-design.md` | This document |
| `server/scripts/discord-role-sync.js` | Sync runner script |
| `server/src/db/schema.ts` | Add `discord_members`, `premium_access`, `premium_sync_logs` tables |
| `server/drizzle/` | Migration files generated by `npm run db:generate` |
| `.env.example` | Add `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID`, `DISCORD_PREMIUM_ROLE_ID` |

---

## Scheduled Execution

The sync script is designed to be run as a scheduled Claude Code routine every 30 minutes. It uses only the Discord REST API (no WebSocket/gateway) so it is safe to run as a one-shot process without a persistent connection.
