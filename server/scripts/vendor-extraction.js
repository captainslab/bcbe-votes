#!/usr/bin/env node
/**
 * vendor-extraction.js
 *
 * Queries vote_items for procurement-related entries, extracts likely vendor/company
 * names using regex heuristics, and outputs a ranked JSON report.
 *
 * Usage (run from the server/ directory or repo root):
 *   node server/scripts/vendor-extraction.js
 *   node server/scripts/vendor-extraction.js --since 2025-01-01
 *   node server/scripts/vendor-extraction.js --output report.json
 */

"use strict";

const { Client } = require("pg");
const { writeFileSync } = require("fs");

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql:///bcbe_votes?host=/var/run/postgresql";

const args = process.argv.slice(2);
const sinceIdx = args.indexOf("--since");
const sinceDate = sinceIdx !== -1 ? args[sinceIdx + 1] : null;
const outputIdx = args.indexOf("--output");
const outputFile = outputIdx !== -1 ? args[outputIdx + 1] : null;

// ---------------------------------------------------------------------------
// Procurement keyword filter (case-insensitive)
// ---------------------------------------------------------------------------

const PROCUREMENT_KEYWORDS = [
  "contract",
  "vendor",
  "award",
  "bid",
  "purchase",
  "rfp",
  "rfq",
  "approve",
  "authorize",
];

// ---------------------------------------------------------------------------
// Vendor extraction patterns
//
// We look for capitalized multi-word proper noun phrases that appear in
// recognizable procurement positions, such as:
//   "APPROVAL OF CONTRACT - ALLIED INSTRUCTIONAL SERVICES"
//   "CONTRACT FOR SERVICES WITH ALTAPOINTE AT J LARRY NEWTON SCHOOL"
//   "Award to ABC Corp"
//   "approve contract with Smith & Associates, LLC"
// ---------------------------------------------------------------------------

const PRECEDING_PATTERNS = [
  // "APPROVAL OF CONTRACT - VENDOR NAME" (most common pattern in this dataset)
  /\bapproval\s+of\s+(?:amended\s+)?contracts?\s*[-–]\s*([A-Z][A-Z0-9&',.\s-]{2,60}?)(?:\s*$)/gi,
  // "AMENDED CONTRACT - VENDOR NAME"
  /\bamended\s+contract\s*[-–]\s*([A-Z][A-Z0-9&',.\s-]{2,60}?)(?:\s*$)/gi,
  // "CONTRACT - VENDOR NAME" (standalone dash separator, not preceded by APPROVAL OF)
  /(?<!approval\s+of\s)(?<!amended\s)\bcontract\s*[-–]\s*([A-Z][A-Z0-9&',.\s-]{2,60}?)(?:\s*$)/gi,
  // "with VENDOR NAME" — appears mid-sentence
  /\bwith\s+([A-Z][A-Za-z0-9&',.]+(?:\s+[A-Z][A-Za-z0-9&',.]+){0,5})(?:\s+(?:for|at|to|in|of)|$)/gi,
  // "award to VENDOR NAME"
  /\baward(?:ed)?\s+to\s+([A-Z][A-Za-z0-9&',.]+(?:\s+[A-Z][A-Za-z0-9&',.]+){0,5})/gi,
  // "from VENDOR NAME"
  /\bfrom\s+([A-Z][A-Za-z0-9&',.]+(?:\s+[A-Z][A-Za-z0-9&',.]+){0,5})/gi,
  // "VENDOR NAME CONTRACT" — e.g. "SOLUTION TREE PROFESSIONAL DEVELOPMENT CONTRACT"
  /^([A-Z][A-Z\s&',.-]{4,50}?)\s+(?:CONTRACT|AGREEMENT)\b/gi,
];

// Suffix noise to strip after extraction (with optional leading comma/space)
const STRIP_TRAILING_RE =
  /[,\s]+(?:for|at|in|of|the|a|an|its|services?|contracts?|agreement|inc\.?|llc\.?|ltd\.?|corp\.?|consulting|group|associates?|solutions?|training|learning)\s*$/i;

// Generic phrases that are not company names (lowercased for comparison)
const SKIP_NAMES = new Set([
  "approval",
  "approval of amended",
  "services",
  "service",
  "contract",
  "contracts",
  "agreement",
  "agreements",
  "property purchase",
  "property purchase agreement",
  "the board",
  "school board",
  "the district",
  "district",
  "superintendent",
  "interpreting services",
  "behavioral analysts",
  "textbook",
  "training",
  "professional development",
  "learning",
  "education",
  "early learning",
  "county",
  "assistant superintendent",
  "csfo appointment and employment",
  "csfo",
  "bids",
  "proposals",
  "bids/proposals",
  "model",
  "form",
  "teams",
  "purchase",
  "employment",
  "appointment",
  "interpreters",
]);

// Additional skip regex patterns for obvious non-vendor captures
const SKIP_PATTERNS = [
  /^\d{4}[-–]\d{4}$/, // date range like "2023-2024"
  /\bappointment\b/i,
  /\bemployment\b/i,
  /\bpurchase agreement\b/i,
  /\bpurchase\b.*\bproperty\b/i,
  /\bproperty\b.*\bpurchase\b/i,
  /\bnon-renewal\b/i,
  /\bprincipal\b/i,
  /\bfinancial officer\b/i,
  /\bsuperintendent\b/i,
  /\bworkshop\b/i,
  /\btraining\s+(?:at|onsite|in)\b/i,
  /^[A-Z]{2,4}$/, // bare acronyms like "MCS"
];

// ---------------------------------------------------------------------------
// Dollar amount extractor
// ---------------------------------------------------------------------------

const DOLLAR_RE =
  /\$[\d,]+(?:\.\d{2})?(?:\s*(?:million|billion|thousand|M|B|K))?/gi;

function parseDollarAmount(str) {
  const s = str.replace(/\$|,/g, "").trim();
  const multipliers = { million: 1e6, billion: 1e9, thousand: 1e3, m: 1e6, b: 1e9, k: 1e3 };
  const match = s.match(/^([\d.]+)\s*([a-z]+)?$/i);
  if (!match) return null;
  const base = parseFloat(match[1]);
  const mult = match[2] ? (multipliers[match[2].toLowerCase()] || 1) : 1;
  return Math.round(base * mult);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cleanVendorName(raw) {
  let name = raw.trim().replace(/\s+/g, " ");
  // Strip leading numbered item prefixes like "1. "
  name = name.replace(/^\d+\.\s+/, "");
  // Strip trailing punctuation
  name = name.replace(/[,;.:]+$/, "");
  // Strip trailing school-year range like "2023-2024" or "23-24"
  name = name.replace(/\s+\d{2,4}[-–]\d{2,4}$/, "");
  // Iteratively strip trailing filler words
  let prev;
  do {
    prev = name;
    name = name.replace(STRIP_TRAILING_RE, "").trim();
  } while (name !== prev);
  return name.trim();
}

function extractDollarAmounts(text) {
  const matches = [];
  let m;
  DOLLAR_RE.lastIndex = 0;
  while ((m = DOLLAR_RE.exec(text)) !== null) {
    matches.push(m[0]);
  }
  return matches;
}

function extractVendors(title, contentText) {
  const text = [title, contentText].filter(Boolean).join(" ");
  const vendors = new Set();

  for (const pattern of PRECEDING_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const name = cleanVendorName(match[1]);
      const nameLower = name.toLowerCase();
      const skipByPattern = SKIP_PATTERNS.some((p) => p.test(name));
      if (
        name.length >= 3 &&
        !SKIP_NAMES.has(nameLower) &&
        !skipByPattern &&
        /^[A-Z]/.test(name)
      ) {
        vendors.add(name);
      }
    }
  }

  return [...vendors];
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  try {
    // Build parameterized WHERE clause for procurement keywords
    const whereClauses = PROCUREMENT_KEYWORDS.map(
      (k, i) => `vi.item_title ILIKE $${i + 1}`
    );
    const params = PROCUREMENT_KEYWORDS.map((k) => `%${k}%`);

    let query = `
      SELECT
        vi.id,
        vi.item_title,
        vi.content_text,
        vi.source_excerpt,
        vi.motion_text,
        vi.created_at,
        m.date AS meeting_date
      FROM vote_items vi
      JOIN meetings m ON m.id = vi.meeting_id
      WHERE (${whereClauses.join(" OR ")})
    `;

    if (sinceDate) {
      params.push(sinceDate);
      query += ` AND m.date >= $${params.length}`;
    }

    query += " ORDER BY m.date DESC";

    const { rows } = await client.query(query, params);

    // Build vendor map: vendor name -> aggregated data
    const vendorMap = new Map();

    for (const row of rows) {
      const names = extractVendors(row.item_title, row.content_text);
      const fullText = [row.item_title, row.source_excerpt, row.motion_text, row.content_text]
        .filter(Boolean)
        .join(" ");
      const dollars = extractDollarAmounts(fullText);

      for (const name of names) {
        if (!vendorMap.has(name)) {
          vendorMap.set(name, {
            name,
            count: 0,
            total_spend: 0,
            vote_item_ids: [],
            dollar_amounts: [],
            last_seen: null,
          });
        }
        const entry = vendorMap.get(name);
        entry.count += 1;
        entry.vote_item_ids.push(row.id);
        if (dollars.length) {
          entry.dollar_amounts.push(...dollars);
          for (const d of dollars) {
            entry.total_spend += parseDollarAmount(d) || 0;
          }
        }
        if (!entry.last_seen || row.meeting_date > entry.last_seen) {
          entry.last_seen = row.meeting_date
            ? row.meeting_date.toISOString()
            : null;
        }
      }
    }

    // Sort vendors by total_spend descending, then count descending as tiebreaker
    const vendors = [...vendorMap.values()].sort(
      (a, b) => b.total_spend - a.total_spend || b.count - a.count
    );

    // Deduplicate dollar amounts per vendor
    for (const v of vendors) {
      v.dollar_amounts = [...new Set(v.dollar_amounts)];
    }

    // Flag vendors newly seen in the last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const newVendorNames = vendors
      .filter((v) => v.last_seen && new Date(v.last_seen) >= thirtyDaysAgo)
      .map((v) => v.name);

    const report = {
      generated_at: new Date().toISOString(),
      since_filter: sinceDate || null,
      total_procurement_items: rows.length,
      unique_vendors_identified: vendors.length,
      new_vendors_last_30_days: newVendorNames,
      vendors,
    };

    const output = JSON.stringify(report, null, 2);

    if (outputFile) {
      writeFileSync(outputFile, output, "utf8");
      process.stderr.write(`Report written to ${outputFile}\n`);
    } else {
      process.stdout.write(output + "\n");
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  process.stderr.write(`vendor-extraction error: ${err.message}\n`);
  process.exit(1);
});
