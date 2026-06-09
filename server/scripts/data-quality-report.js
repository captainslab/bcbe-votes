#!/usr/bin/env node
/**
 * data-quality-report.js
 *
 * Queries the boardvotes.io PostgreSQL database for data quality signals and
 * outputs a structured JSON report to stdout.
 *
 * Checks:
 *   1. Vote items with low confidence_score (< 0.7)
 *   2. Vote items flagged verification_status = 'needs_review' or 'flagged'
 *   3. Vote items missing source_excerpt (no traceability)
 *   4. Vote items missing summary_text (no human-readable summary)
 *   5. Meetings with 0 vote items (empty / failed ingestion)
 *   6. Vote records with null board_member_id (orphaned after member deletion)
 *   7. Recent import_logs entries (last 7 days) — failures and flagged counts
 *
 * Usage:
 *   node server/scripts/data-quality-report.js
 *   DATABASE_URL=postgres://... node server/scripts/data-quality-report.js
 */

"use strict";

const { Client } = require("pg");
const path = require("path");
const fs = require("fs");

// Load .env from server directory if present
function loadEnv() {
  const envPaths = [
    path.resolve(__dirname, "../../.env"),
    path.resolve(__dirname, "../.env"),
    path.resolve(process.cwd(), ".env"),
  ];
  for (const envPath of envPaths) {
    if (fs.existsSync(envPath)) {
      const lines = fs.readFileSync(envPath, "utf8").split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx === -1) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
        if (!process.env[key]) process.env[key] = val;
      }
      break;
    }
  }
}

loadEnv();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL is not set.");
  process.exit(1);
}

const LOW_CONFIDENCE_THRESHOLD = 0.7;
const RECENT_DAYS = 7;

async function runQuery(client, label, sql, params = []) {
  try {
    const result = await client.query(sql, params);
    return { ok: true, rows: result.rows };
  } catch (err) {
    return { ok: false, error: `${label}: ${err.message}`, rows: [] };
  }
}

async function main() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  const errors = [];
  const report = {
    generatedAt: new Date().toISOString(),
    thresholds: { lowConfidence: LOW_CONFIDENCE_THRESHOLD, recentDays: RECENT_DAYS },
  };

  // ── 1. Low-confidence vote items ─────────────────────────────────────────
  const lowConfRes = await runQuery(
    client,
    "low_confidence",
    `SELECT
       vi.id,
       vi.item_title,
       vi.confidence_score::float AS confidence_score,
       vi.verification_status,
       vi.meeting_id,
       m.date::date AS meeting_date,
       m.title AS meeting_title
     FROM vote_items vi
     JOIN meetings m ON m.id = vi.meeting_id
     WHERE vi.confidence_score IS NOT NULL
       AND vi.confidence_score::numeric < $1
     ORDER BY vi.confidence_score ASC, m.date DESC
     LIMIT 100`,
    [LOW_CONFIDENCE_THRESHOLD]
  );
  if (!lowConfRes.ok) errors.push(lowConfRes.error);
  report.lowConfidenceItems = {
    count: lowConfRes.rows.length,
    items: lowConfRes.rows,
    note: "Vote items with confidence_score < 0.7 — hidden from public by default",
  };

  // ── 2. Items with no confidence_score at all ──────────────────────────────
  const noScoreRes = await runQuery(
    client,
    "no_confidence_score",
    `SELECT
       vi.id,
       vi.item_title,
       vi.verification_status,
       vi.meeting_id,
       m.date::date AS meeting_date
     FROM vote_items vi
     JOIN meetings m ON m.id = vi.meeting_id
     WHERE vi.confidence_score IS NULL
     ORDER BY m.date DESC
     LIMIT 100`
  );
  if (!noScoreRes.ok) errors.push(noScoreRes.error);
  report.itemsMissingConfidenceScore = {
    count: noScoreRes.rows.length,
    items: noScoreRes.rows,
    note: "Vote items where confidence_score was never set — ingestion may be incomplete",
  };

  // ── 3. Items flagged for review ───────────────────────────────────────────
  const flaggedRes = await runQuery(
    client,
    "flagged_items",
    `SELECT
       vi.id,
       vi.item_title,
       vi.confidence_score::float AS confidence_score,
       vi.verification_status,
       vi.detected_pattern,
       vi.meeting_id,
       m.date::date AS meeting_date,
       m.title AS meeting_title
     FROM vote_items vi
     JOIN meetings m ON m.id = vi.meeting_id
     WHERE vi.verification_status IN ('needs_review', 'flagged')
     ORDER BY vi.verification_status DESC, m.date DESC
     LIMIT 100`
  );
  if (!flaggedRes.ok) errors.push(flaggedRes.error);
  report.itemsFlaggedForReview = {
    count: flaggedRes.rows.length,
    items: flaggedRes.rows,
    note: "Vote items explicitly marked needs_review or flagged",
  };

  // ── 4. Items missing source_excerpt ──────────────────────────────────────
  const noExcerptRes = await runQuery(
    client,
    "missing_source_excerpt",
    `SELECT
       vi.id,
       vi.item_title,
       vi.verification_status,
       vi.confidence_score::float AS confidence_score,
       vi.meeting_id,
       m.date::date AS meeting_date,
       m.source_url AS meeting_source_url
     FROM vote_items vi
     JOIN meetings m ON m.id = vi.meeting_id
     WHERE vi.source_excerpt IS NULL OR trim(vi.source_excerpt) = ''
     ORDER BY m.date DESC
     LIMIT 100`
  );
  if (!noExcerptRes.ok) errors.push(noExcerptRes.error);
  report.itemsMissingSourceExcerpt = {
    count: noExcerptRes.rows.length,
    items: noExcerptRes.rows,
    note: "Vote items with no source_excerpt — cannot verify against original document",
  };

  // ── 5. Items missing summary_text ────────────────────────────────────────
  const noSummaryRes = await runQuery(
    client,
    "missing_summary",
    `SELECT
       vi.id,
       vi.item_title,
       vi.verification_status,
       vi.meeting_id,
       m.date::date AS meeting_date
     FROM vote_items vi
     JOIN meetings m ON m.id = vi.meeting_id
     WHERE vi.summary_text IS NULL OR trim(vi.summary_text) = ''
     ORDER BY m.date DESC
     LIMIT 100`
  );
  if (!noSummaryRes.ok) errors.push(noSummaryRes.error);
  report.itemsMissingSummary = {
    count: noSummaryRes.rows.length,
    items: noSummaryRes.rows,
    note: "Vote items with no AI-generated summary — public description will be blank",
  };

  // ── 6. Meetings with 0 vote items ────────────────────────────────────────
  const emptyMeetingsRes = await runQuery(
    client,
    "empty_meetings",
    `SELECT
       m.id,
       m.date::date AS meeting_date,
       m.title,
       m.type,
       m.ingestion_status,
       m.source_url,
       m.minutes_url
     FROM meetings m
     LEFT JOIN vote_items vi ON vi.meeting_id = m.id
     WHERE vi.id IS NULL
     ORDER BY m.date DESC
     LIMIT 100`
  );
  if (!emptyMeetingsRes.ok) errors.push(emptyMeetingsRes.error);
  report.emptyMeetings = {
    count: emptyMeetingsRes.rows.length,
    meetings: emptyMeetingsRes.rows,
    note: "Meetings with no vote items — ingestion may have failed or minutes not yet available",
  };

  // ── 7. Vote records with null board_member_id (orphaned) ─────────────────
  const orphanVotesRes = await runQuery(
    client,
    "orphaned_vote_records",
    `SELECT
       vr.id,
       vr.vote_item_id,
       vr.vote_value,
       vi.item_title,
       m.date::date AS meeting_date
     FROM vote_records vr
     JOIN vote_items vi ON vi.id = vr.vote_item_id
     JOIN meetings m ON m.id = vi.meeting_id
     WHERE vr.board_member_id IS NULL
     ORDER BY m.date DESC
     LIMIT 100`
  );
  if (!orphanVotesRes.ok) errors.push(orphanVotesRes.error);
  report.orphanedVoteRecords = {
    count: orphanVotesRes.rows.length,
    records: orphanVotesRes.rows,
    note: "Vote records where board_member_id is NULL (member was deleted) — vote is unattributed",
  };

  // ── 8. Recent import logs (last N days) ──────────────────────────────────
  const importLogsRes = await runQuery(
    client,
    "import_logs",
    `SELECT
       id,
       type,
       started_at,
       completed_at,
       meetings_processed,
       votes_created,
       records_flagged,
       error_summary,
       CASE WHEN completed_at IS NULL THEN 'running_or_hung' ELSE 'done' END AS status
     FROM import_logs
     WHERE started_at >= NOW() - ($1 || ' days')::interval
     ORDER BY started_at DESC
     LIMIT 50`,
    [RECENT_DAYS]
  );
  if (!importLogsRes.ok) errors.push(importLogsRes.error);

  const logs = importLogsRes.rows;
  const failedImports = logs.filter((l) => l.error_summary && l.error_summary.trim() !== "");
  const hungImports = logs.filter((l) => l.status === "running_or_hung");
  const totalFlagged = logs.reduce((s, l) => s + (parseInt(l.records_flagged, 10) || 0), 0);
  const totalVotesCreated = logs.reduce((s, l) => s + (parseInt(l.votes_created, 10) || 0), 0);

  report.recentImports = {
    windowDays: RECENT_DAYS,
    totalRuns: logs.length,
    totalVotesCreated,
    totalRecordsFlagged: totalFlagged,
    failedRuns: failedImports.length,
    hungRuns: hungImports.length,
    logs,
    note: `Import activity in the last ${RECENT_DAYS} days`,
  };

  // ── 9. Overall summary ───────────────────────────────────────────────────
  const totalVoteItemsRes = await runQuery(
    client,
    "total_vote_items",
    `SELECT COUNT(*) AS total FROM vote_items`
  );
  const totalMeetingsRes = await runQuery(
    client,
    "total_meetings",
    `SELECT COUNT(*) AS total FROM meetings`
  );

  report.summary = {
    totalVoteItems: parseInt(totalVoteItemsRes.rows[0]?.total ?? 0, 10),
    totalMeetings: parseInt(totalMeetingsRes.rows[0]?.total ?? 0, 10),
    issueCount: {
      lowConfidence: report.lowConfidenceItems.count,
      missingConfidenceScore: report.itemsMissingConfidenceScore.count,
      flaggedForReview: report.itemsFlaggedForReview.count,
      missingSourceExcerpt: report.itemsMissingSourceExcerpt.count,
      missingSummary: report.itemsMissingSummary.count,
      emptyMeetings: report.emptyMeetings.count,
      orphanedVoteRecords: report.orphanedVoteRecords.count,
      recentImportFailures: report.recentImports.failedRuns,
    },
    errors,
  };

  await client.end();

  process.stdout.write(JSON.stringify(report, null, 2) + "\n");

  // Exit non-zero if there were query errors so callers/monitors can detect it
  if (errors.length > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
