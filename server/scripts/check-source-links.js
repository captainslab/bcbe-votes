#!/usr/bin/env node
/**
 * check-source-links.js
 *
 * Queries all distinct source_url values from vote_items, performs a HEAD
 * request against each one, and reports which links are broken.
 *
 * Output: JSON to stdout
 * {
 *   checked: number,
 *   ok: number,
 *   broken: Array<{ url, status, error, voteItemIds: number[] }>,
 *   checkedAt: ISO string
 * }
 *
 * Usage:
 *   DATABASE_URL=<dsn> node server/scripts/check-source-links.js
 *   # or source .env first if running from the repo root
 */

"use strict";

const { Client } = require("pg");
const https = require("https");
const http = require("http");
const { URL } = require("url");

const TIMEOUT_MS = 10_000;
const CONCURRENCY = 5; // parallel HEAD requests at a time

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Perform a HEAD request, following up to 5 redirects. Returns { status } or throws. */
function headRequest(rawUrl, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(rawUrl);
    } catch (e) {
      return reject(new Error(`Invalid URL: ${rawUrl}`));
    }

    const lib = parsed.protocol === "https:" ? https : http;
    const options = {
      method: "HEAD",
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
      path: parsed.pathname + parsed.search,
      headers: {
        "User-Agent": "boardvotes-link-checker/1.0 (+https://boardvotes.io)",
      },
      timeout: TIMEOUT_MS,
    };

    const req = lib.request(options, (res) => {
      const { statusCode, headers } = res;
      // Consume response body to free socket
      res.resume();

      if (
        redirectsLeft > 0 &&
        statusCode >= 300 &&
        statusCode < 400 &&
        headers.location
      ) {
        // Resolve relative redirects against the original URL
        let next;
        try {
          next = new URL(headers.location, rawUrl).href;
        } catch (_) {
          next = headers.location;
        }
        return headRequest(next, redirectsLeft - 1).then(resolve).catch(reject);
      }

      resolve({ status: statusCode });
    });

    req.on("timeout", () => {
      req.destroy();
      reject(new Error("timeout"));
    });

    req.on("error", (err) => {
      reject(err);
    });

    req.end();
  });
}

/** Run an async function over an array with bounded concurrency. */
async function pMap(items, fn, concurrency) {
  const results = [];
  let i = 0;

  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, worker);
  await Promise.all(workers);
  return results;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("Error: DATABASE_URL environment variable is not set.");
    process.exit(1);
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  // Fetch all distinct source_urls and the IDs of vote_items that use them.
  // source_url lives on meetings (via the meeting join) — but per the schema
  // the ingestion stores a source_url on vote_items directly via source_excerpt;
  // check the actual column name first.
  let rows;
  try {
    const res = await client.query(`
      SELECT
        vi.source_url        AS url,
        array_agg(vi.id ORDER BY vi.id) AS vote_item_ids
      FROM vote_items vi
      WHERE vi.source_url IS NOT NULL
        AND vi.source_url <> ''
      GROUP BY vi.source_url
      ORDER BY vi.source_url
    `);
    rows = res.rows;
  } catch (err) {
    // Fallback: try meetings.source_url joined to vote_items
    if (err.message && err.message.includes("source_url")) {
      const res2 = await client.query(`
        SELECT
          m.source_url         AS url,
          array_agg(vi.id ORDER BY vi.id) AS vote_item_ids
        FROM vote_items vi
        JOIN meetings m ON m.id = vi.meeting_id
        WHERE m.source_url IS NOT NULL
          AND m.source_url <> ''
        GROUP BY m.source_url
        ORDER BY m.source_url
      `);
      rows = res2.rows;
    } else {
      throw err;
    }
  } finally {
    await client.end();
  }

  if (rows.length === 0) {
    const report = { checked: 0, ok: 0, broken: [], checkedAt: new Date().toISOString() };
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
    return;
  }

  const broken = [];
  let okCount = 0;

  process.stderr.write(
    `Checking ${rows.length} distinct source URLs (concurrency=${CONCURRENCY})...\n`
  );

  await pMap(rows, async ({ url, vote_item_ids }, idx) => {
    let result;
    try {
      result = await headRequest(url);
      if (result.status >= 200 && result.status < 400) {
        okCount++;
        process.stderr.write(`  [${idx + 1}/${rows.length}] OK (${result.status}) ${url}\n`);
      } else {
        broken.push({ url, status: result.status, error: null, voteItemIds: vote_item_ids });
        process.stderr.write(
          `  [${idx + 1}/${rows.length}] BROKEN (HTTP ${result.status}) ${url}\n`
        );
      }
    } catch (err) {
      broken.push({ url, status: null, error: err.message, voteItemIds: vote_item_ids });
      process.stderr.write(
        `  [${idx + 1}/${rows.length}] BROKEN (${err.message}) ${url}\n`
      );
    }
  }, CONCURRENCY);

  const report = {
    checked: rows.length,
    ok: okCount,
    broken,
    checkedAt: new Date().toISOString(),
  };

  process.stdout.write(JSON.stringify(report, null, 2) + "\n");

  if (broken.length > 0) {
    process.stderr.write(
      `\nSummary: ${broken.length} broken link(s) out of ${rows.length} checked.\n`
    );
    process.exitCode = 1;
  } else {
    process.stderr.write(`\nSummary: all ${rows.length} source links are reachable.\n`);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
