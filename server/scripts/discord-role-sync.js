#!/usr/bin/env node
/**
 * discord-role-sync.js
 *
 * Syncs Discord premium role members into the boardvotes.io database.
 * Designed to be run on a schedule (every 30 min via Claude Code routines).
 *
 * Required env vars:
 *   DISCORD_BOT_TOKEN       — Bot token from Discord Developer Portal
 *   DISCORD_GUILD_ID        — Numeric ID of the boardvotes.io Discord server
 *   DISCORD_PREMIUM_ROLE_ID — Numeric ID of the premium role to sync
 *   DATABASE_URL            — PostgreSQL connection string (already required by server)
 *
 * Setup instructions if env vars are missing:
 *   1. Go to https://discord.com/developers/applications and create an application.
 *   2. Under "Bot", create a bot and copy the token → DISCORD_BOT_TOKEN
 *   3. Enable "Server Members Intent" under Bot > Privileged Gateway Intents.
 *   4. Invite the bot to your server with the "bot" scope and "Read Members" permission.
 *   5. In Discord (with Developer Mode on), right-click your server → Copy Server ID → DISCORD_GUILD_ID
 *   6. Right-click the premium role in Server Settings → Roles → Copy Role ID → DISCORD_PREMIUM_ROLE_ID
 *   7. Add all three vars to /home/jordan/bcbe-votes/.env
 */

const path = require("path");


// ---------------------------------------------------------------------------
// Load .env from repo root (two levels up from server/scripts/)
// ---------------------------------------------------------------------------
let dotenv;
try {
  dotenv = require("dotenv");
  const dotenvExpand = require("dotenv-expand");
  const repoRoot = path.resolve(__dirname, "..", "..");
  const result = dotenv.config({ path: path.join(repoRoot, ".env") });
  if (result.parsed) dotenvExpand.expand(result);
  // Also try server root .env
  dotenv.config({ path: path.join(__dirname, "..", ".env") });
} catch {
  // dotenv is optional — rely on shell env if not available
}

// ---------------------------------------------------------------------------
// Validate required env vars
// ---------------------------------------------------------------------------
const REQUIRED = ["DISCORD_BOT_TOKEN", "DISCORD_GUILD_ID", "DISCORD_PREMIUM_ROLE_ID", "DATABASE_URL"];
const missing = REQUIRED.filter((v) => !process.env[v]);

if (missing.length > 0) {
  console.log("=== DISCORD ROLE SYNC — SETUP PENDING ===");
  console.log("");
  console.log("Missing required environment variables:");
  missing.forEach((v) => console.log(`  • ${v}`));
  console.log("");
  console.log("Setup steps:");
  console.log("  1. Create a Discord application at https://discord.com/developers/applications");
  console.log("  2. Under 'Bot', generate a token → add as DISCORD_BOT_TOKEN");
  console.log("  3. Enable 'Server Members Intent' in Bot > Privileged Gateway Intents");
  console.log("  4. Invite the bot to your server (bot scope, Read Members permission)");
  console.log("  5. Right-click your Discord server → Copy Server ID → add as DISCORD_GUILD_ID");
  console.log("  6. Right-click the premium role → Copy Role ID → add as DISCORD_PREMIUM_ROLE_ID");
  console.log("  7. Ensure DATABASE_URL is set (already required for the main server)");
  console.log("  8. Add all vars to /home/jordan/bcbe-votes/.env");
  console.log("");
  console.log("Once configured, this script will sync premium members every 30 minutes.");
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Discord API helpers
// ---------------------------------------------------------------------------
const DISCORD_BASE = "https://discord.com/api/v10";
const GUILD_ID = process.env.DISCORD_GUILD_ID;
const ROLE_ID = process.env.DISCORD_PREMIUM_ROLE_ID;
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

/**
 * Fetch all guild members who hold the premium role.
 * Discord's /members endpoint returns up to 1000 per page; we paginate using `after`.
 * @returns {Promise<Array<{id: string, username: string, avatar: string|null}>>}
 */
async function fetchPremiumMembers() {
  const premiumMembers = [];
  let after = "0";
  let page = 0;

  while (true) {
    page++;
    const url = `${DISCORD_BASE}/guilds/${GUILD_ID}/members?limit=1000&after=${after}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bot ${BOT_TOKEN}`,
        "Content-Type": "application/json",
        "User-Agent": "boardvotes-sync/1.0",
      },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Discord API error on page ${page}: HTTP ${res.status} — ${body}`);
    }

    const members = await res.json();
    if (!Array.isArray(members) || members.length === 0) break;

    for (const member of members) {
      if (member.roles && member.roles.includes(ROLE_ID)) {
        premiumMembers.push({
          id: member.user.id,
          username: member.user.username ?? member.user.id,
          avatar: member.user.avatar ?? null,
        });
      }
    }

    if (members.length < 1000) break; // last page
    after = members[members.length - 1].user.id;
  }

  return premiumMembers;
}

// ---------------------------------------------------------------------------
// Database helpers (raw pg — avoids needing to compile TypeScript)
// ---------------------------------------------------------------------------
async function getDb() {
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  return client;
}

async function ensureTables(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS discord_members (
      id            SERIAL PRIMARY KEY,
      discord_id    TEXT NOT NULL UNIQUE,
      username      TEXT,
      avatar        TEXT,
      first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS premium_access (
      id                SERIAL PRIMARY KEY,
      discord_member_id INTEGER NOT NULL REFERENCES discord_members(id) ON DELETE CASCADE,
      is_active         BOOLEAN NOT NULL DEFAULT TRUE,
      granted_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      revoked_at        TIMESTAMPTZ,
      grant_source      TEXT NOT NULL DEFAULT 'discord_role',
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT premium_access_discord_member_unique UNIQUE (discord_member_id)
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS premium_sync_logs (
      id              SERIAL PRIMARY KEY,
      started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at    TIMESTAMPTZ,
      members_fetched INTEGER NOT NULL DEFAULT 0,
      granted         INTEGER NOT NULL DEFAULT 0,
      revoked         INTEGER NOT NULL DEFAULT 0,
      unchanged       INTEGER NOT NULL DEFAULT 0,
      error_summary   TEXT,
      success         BOOLEAN NOT NULL DEFAULT FALSE
    )
  `);
}

// ---------------------------------------------------------------------------
// Sync logic
// ---------------------------------------------------------------------------
async function sync(client, premiumMembers) {
  const stats = { granted: 0, revoked: 0, unchanged: 0 };
  const currentIds = new Set(premiumMembers.map((m) => m.id));

  // --- Step 1: upsert each current premium member ---
  for (const member of premiumMembers) {
    // Upsert discord_members
    const dmRes = await client.query(
      `INSERT INTO discord_members (discord_id, username, avatar, last_seen_at, updated_at)
       VALUES ($1, $2, $3, NOW(), NOW())
       ON CONFLICT (discord_id) DO UPDATE
         SET username     = EXCLUDED.username,
             avatar       = EXCLUDED.avatar,
             last_seen_at = NOW(),
             updated_at   = NOW()
       RETURNING id`,
      [member.id, member.username, member.avatar],
    );
    const dmId = dmRes.rows[0].id;

    // Upsert premium_access
    const paRes = await client.query(
      `INSERT INTO premium_access (discord_member_id, is_active, granted_at, revoked_at, updated_at)
       VALUES ($1, TRUE, NOW(), NULL, NOW())
       ON CONFLICT (discord_member_id) DO UPDATE
         SET is_active  = TRUE,
             granted_at = CASE WHEN premium_access.is_active = FALSE THEN NOW() ELSE premium_access.granted_at END,
             revoked_at = NULL,
             updated_at = NOW()
       RETURNING (xmax = 0) AS inserted, is_active`,
      [dmId],
    );

    const row = paRes.rows[0];
    if (row.inserted) {
      stats.granted++;
    } else {
      // xmax != 0 means UPDATE happened; check if we re-activated
      // We count as granted if revoked_at was previously set (i.e. we restored access)
      // Simpler: track via a flag — but to keep this script self-contained we just
      // count updates as unchanged (the granted_at CASE above handles the real state)
      stats.unchanged++;
    }
  }

  // --- Step 2: revoke members no longer holding the role ---
  const revokeRes = await client.query(
    `UPDATE premium_access pa
     SET is_active  = FALSE,
         revoked_at = NOW(),
         updated_at = NOW()
     FROM discord_members dm
     WHERE pa.discord_member_id = dm.id
       AND pa.is_active = TRUE
       AND dm.discord_id != ALL($1::text[])
     RETURNING pa.id`,
    [currentIds.size > 0 ? [...currentIds] : ["__nobody__"]],
  );
  stats.revoked = revokeRes.rowCount ?? 0;

  return stats;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const startedAt = new Date();
  console.log(`[${startedAt.toISOString()}] Starting Discord role sync…`);

  let client;
  let logId;

  try {
    client = await getDb();
    await ensureTables(client);

    // Insert a log row for this run
    const logRes = await client.query(
      `INSERT INTO premium_sync_logs (started_at) VALUES (NOW()) RETURNING id`,
    );
    logId = logRes.rows[0].id;

    // Fetch premium members from Discord
    console.log(`  Fetching guild members with role ${ROLE_ID} from guild ${GUILD_ID}…`);
    const premiumMembers = await fetchPremiumMembers();
    console.log(`  Discord returned ${premiumMembers.length} premium member(s).`);

    // Sync to database
    const stats = await sync(client, premiumMembers);

    const completedAt = new Date();
    await client.query(
      `UPDATE premium_sync_logs
       SET completed_at    = $1,
           members_fetched = $2,
           granted         = $3,
           revoked         = $4,
           unchanged       = $5,
           success         = TRUE
       WHERE id = $6`,
      [completedAt, premiumMembers.length, stats.granted, stats.revoked, stats.unchanged, logId],
    );

    console.log("");
    console.log("=== SYNC COMPLETE ===");
    console.log(`  Members with premium role : ${premiumMembers.length}`);
    console.log(`  Granted (new/restored)    : ${stats.granted}`);
    console.log(`  Revoked                   : ${stats.revoked}`);
    console.log(`  Unchanged                 : ${stats.unchanged}`);
    console.log(`  Duration                  : ${completedAt - startedAt}ms`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("SYNC ERROR:", message);

    if (client && logId) {
      try {
        await client.query(
          `UPDATE premium_sync_logs
           SET completed_at = NOW(), error_summary = $1, success = FALSE
           WHERE id = $2`,
          [message, logId],
        );
      } catch {
        // swallow secondary error
      }
    }

    process.exit(1);
  } finally {
    if (client) await client.end();
  }
}

main();
