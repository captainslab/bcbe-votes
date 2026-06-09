#!/usr/bin/env node
/**
 * check-og-tags.js
 *
 * Fetches boardvotes.io and checks for required Open Graph / Twitter Card tags.
 * Also verifies that the og:image URL is accessible.
 *
 * Usage:
 *   node server/scripts/check-og-tags.js
 *   node server/scripts/check-og-tags.js --url https://boardvotes.io
 *
 * Exit code 0 = all required tags present and image reachable.
 * Exit code 1 = one or more checks failed.
 */

"use strict";

const https = require("https");
const http = require("http");
const { URL } = require("url");

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const TARGET_URL = process.argv.find((a) => a.startsWith("--url="))?.split("=")[1]
  || process.argv[process.argv.indexOf("--url") + 1]?.startsWith("http") && process.argv[process.argv.indexOf("--url") + 1]
  || "https://boardvotes.io";

const REQUIRED_TAGS = [
  "og:title",
  "og:description",
  "og:image",
  "og:url",
  "og:type",
  "twitter:card",
  "twitter:title",
  "twitter:description",
  "twitter:image",
];

const RECOMMENDED_TAGS = [
  "og:site_name",
  "og:image:width",
  "og:image:height",
  "og:image:alt",
  "twitter:image:alt",
  "twitter:site",
];

const TIMEOUT_MS = 15_000;

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

function fetchPage(rawUrl, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(rawUrl);
    const lib = parsed.protocol === "https:" ? https : http;

    const req = lib.request(
      {
        method: "GET",
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
        path: parsed.pathname + parsed.search,
        headers: {
          "User-Agent": "boardvotes-og-checker/1.0 (+https://boardvotes.io)",
          Accept: "text/html",
        },
        timeout: TIMEOUT_MS,
      },
      (res) => {
        if (redirectsLeft > 0 && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          const next = new URL(res.headers.location, rawUrl).href;
          return fetchPage(next, redirectsLeft - 1).then(resolve).catch(reject);
        }

        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => { body += chunk; });
        res.on("end", () => resolve({ status: res.statusCode, body }));
      }
    );

    req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
    req.on("error", reject);
    req.end();
  });
}

function headRequest(rawUrl, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(rawUrl);
    const lib = parsed.protocol === "https:" ? https : http;

    const req = lib.request(
      {
        method: "HEAD",
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
        path: parsed.pathname + parsed.search,
        headers: {
          "User-Agent": "boardvotes-og-checker/1.0 (+https://boardvotes.io)",
        },
        timeout: TIMEOUT_MS,
      },
      (res) => {
        res.resume();
        if (redirectsLeft > 0 && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const next = new URL(res.headers.location, rawUrl).href;
          return headRequest(next, redirectsLeft - 1).then(resolve).catch(reject);
        }
        resolve({ status: res.statusCode, contentType: res.headers["content-type"] || null });
      }
    );

    req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
    req.on("error", reject);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// HTML meta parser
// ---------------------------------------------------------------------------

/**
 * Extract <meta> tag values from raw HTML.
 * Handles both property="og:..." and name="twitter:..." forms.
 * Returns a Map of tag-name → content.
 */
function parseMetaTags(html) {
  const tags = new Map();

  // Match <meta ...> tags (self-closing or not)
  const metaRe = /<meta\s+([^>]+?)(?:\s*\/?>)/gi;
  let m;
  while ((m = metaRe.exec(html)) !== null) {
    const attrs = m[1];

    // Extract property or name attribute
    const propMatch = attrs.match(/(?:property|name)\s*=\s*["']([^"']+)["']/i);
    const contentMatch = attrs.match(/content\s*=\s*["']([^"']*)["']/i);

    if (propMatch && contentMatch) {
      tags.set(propMatch[1].toLowerCase(), contentMatch[1]);
    }
  }

  // Also grab <title>
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) tags.set("title", titleMatch[1].trim());

  return tags;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const checkedAt = new Date().toISOString();
  console.log(`\nOG Tag Checker — boardvotes.io`);
  console.log(`Target : ${TARGET_URL}`);
  console.log(`Time   : ${checkedAt}`);
  console.log("─".repeat(60));

  // 1. Fetch page
  let pageResult;
  try {
    pageResult = await fetchPage(TARGET_URL);
  } catch (err) {
    console.error(`\nFATAL: Could not fetch ${TARGET_URL}: ${err.message}`);
    process.exit(1);
  }

  if (pageResult.status < 200 || pageResult.status >= 400) {
    console.error(`\nFATAL: ${TARGET_URL} returned HTTP ${pageResult.status}`);
    process.exit(1);
  }

  console.log(`\nPage fetch: HTTP ${pageResult.status} OK`);

  // 2. Parse meta tags
  const tags = parseMetaTags(pageResult.body);

  // 3. Check required tags
  console.log("\nRequired tags:");
  const missingRequired = [];
  for (const tag of REQUIRED_TAGS) {
    const val = tags.get(tag);
    if (val) {
      console.log(`  ✓  ${tag}`);
      console.log(`       "${val.slice(0, 90)}${val.length > 90 ? "…" : ""}"`);
    } else {
      console.log(`  ✗  ${tag}  [MISSING]`);
      missingRequired.push(tag);
    }
  }

  // 4. Check recommended tags
  console.log("\nRecommended tags:");
  const missingRecommended = [];
  for (const tag of RECOMMENDED_TAGS) {
    const val = tags.get(tag);
    if (val) {
      console.log(`  ✓  ${tag}`);
      console.log(`       "${val.slice(0, 90)}${val.length > 90 ? "…" : ""}"`);
    } else {
      console.log(`  ~  ${tag}  [not set]`);
      missingRecommended.push(tag);
    }
  }

  // 5. Check og:image accessibility
  const imageUrl = tags.get("og:image");
  let imageCheck = null;
  if (imageUrl) {
    console.log(`\nog:image accessibility check:`);
    console.log(`  URL: ${imageUrl}`);
    try {
      const result = await headRequest(imageUrl);
      imageCheck = { url: imageUrl, status: result.status, contentType: result.contentType };
      if (result.status >= 200 && result.status < 400) {
        console.log(`  ✓  HTTP ${result.status}  content-type: ${result.contentType}`);
        // Warn if SVG — many crawlers won't render SVG og:images
        if (result.contentType && result.contentType.includes("svg")) {
          console.log(`  ⚠  SVG detected. Twitter/X and LinkedIn may not render SVG og:images.`);
          console.log(`     Consider converting to PNG (1200×630) for maximum compatibility.`);
        }
      } else {
        console.log(`  ✗  HTTP ${result.status}  [image not accessible]`);
        imageCheck.error = `HTTP ${result.status}`;
      }
    } catch (err) {
      imageCheck = { url: imageUrl, error: err.message };
      console.log(`  ✗  Could not reach image: ${err.message}`);
    }
  } else {
    console.log(`\nog:image: not set — no image to check`);
  }

  // 6. Structured report to stdout as JSON
  const report = {
    checkedAt,
    targetUrl: TARGET_URL,
    pageStatus: pageResult.status,
    tags: Object.fromEntries(tags),
    required: {
      present: REQUIRED_TAGS.filter((t) => tags.has(t)),
      missing: missingRequired,
    },
    recommended: {
      present: RECOMMENDED_TAGS.filter((t) => tags.has(t)),
      missing: missingRecommended,
    },
    imageCheck,
    passed: missingRequired.length === 0 && (imageCheck === null || !imageCheck.error),
  };

  // 7. Summary
  console.log("\n" + "─".repeat(60));
  if (report.passed) {
    console.log("RESULT: PASS — all required OG tags present and image reachable.");
  } else {
    if (missingRequired.length > 0) {
      console.log(`RESULT: FAIL — ${missingRequired.length} required tag(s) missing: ${missingRequired.join(", ")}`);
    }
    if (imageCheck?.error) {
      console.log(`RESULT: FAIL — og:image is not accessible: ${imageCheck.error}`);
    }
  }

  if (missingRecommended.length > 0) {
    console.log(`\nRecommendations to add: ${missingRecommended.join(", ")}`);
  }

  console.log("\nFull report (JSON):");
  console.log(JSON.stringify(report, null, 2));

  process.exitCode = report.passed ? 0 : 1;
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
