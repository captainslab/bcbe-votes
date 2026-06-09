#!/usr/bin/env node
/**
 * generate-sitemap.js
 * Queries PostgreSQL for all public meetings, vote_items, and board_members,
 * then writes a valid XML sitemap to /var/www/bcbe-votes/sitemap.xml
 */

"use strict";

const { Client } = require("pg");
const fs = require("fs");
const path = require("path");

require("dotenv").config({ path: path.join(__dirname, "../../.env") });

const BASE_URL = "https://boardvotes.io";
const OUTPUT_PATH = "/var/www/bcbe-votes/sitemap.xml";

// Static public routes
const STATIC_ROUTES = [
  { url: "/",          priority: "1.0", changefreq: "daily"   },
  { url: "/votes",     priority: "0.9", changefreq: "daily"   },
  { url: "/meetings",  priority: "0.8", changefreq: "weekly"  },
  { url: "/members",   priority: "0.7", changefreq: "monthly" },
  { url: "/alliances", priority: "0.6", changefreq: "weekly"  },
  { url: "/faq",       priority: "0.5", changefreq: "monthly" },
  { url: "/contact",   priority: "0.4", changefreq: "monthly" },
  { url: "/support",   priority: "0.4", changefreq: "monthly" },
  { url: "/request",   priority: "0.4", changefreq: "monthly" },
  { url: "/boards",    priority: "0.6", changefreq: "weekly"  },
];

function escapeXml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function toW3CDate(date) {
  // Format as YYYY-MM-DD for lastmod
  const d = new Date(date);
  return d.toISOString().slice(0, 10);
}

function buildUrlEntry({ loc, lastmod, changefreq, priority }) {
  let entry = "  <url>\n";
  entry += `    <loc>${escapeXml(loc)}</loc>\n`;
  if (lastmod) entry += `    <lastmod>${lastmod}</lastmod>\n`;
  if (changefreq) entry += `    <changefreq>${changefreq}</changefreq>\n`;
  if (priority) entry += `    <priority>${priority}</priority>\n`;
  entry += "  </url>";
  return entry;
}

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  await client.connect();

  let urls = [];

  // Static routes
  const today = new Date().toISOString().slice(0, 10);
  for (const route of STATIC_ROUTES) {
    urls.push(buildUrlEntry({
      loc: BASE_URL + route.url,
      lastmod: today,
      changefreq: route.changefreq,
      priority: route.priority,
    }));
  }

  // Dynamic: meetings
  const meetingsResult = await client.query(
    `SELECT id, updated_at FROM meetings ORDER BY date DESC`
  );
  for (const row of meetingsResult.rows) {
    urls.push(buildUrlEntry({
      loc: `${BASE_URL}/meetings/${row.id}`,
      lastmod: toW3CDate(row.updated_at),
      changefreq: "monthly",
      priority: "0.8",
    }));
  }

  // Dynamic: vote_items (skip low-confidence)
  const votesResult = await client.query(
    `SELECT id, updated_at FROM vote_items ORDER BY updated_at DESC`
  );
  for (const row of votesResult.rows) {
    urls.push(buildUrlEntry({
      loc: `${BASE_URL}/votes/${row.id}`,
      lastmod: toW3CDate(row.updated_at),
      changefreq: "monthly",
      priority: "0.9",
    }));
  }

  // Dynamic: board_members
  const membersResult = await client.query(
    `SELECT id, updated_at FROM board_members ORDER BY name ASC`
  );
  for (const row of membersResult.rows) {
    urls.push(buildUrlEntry({
      loc: `${BASE_URL}/members/${row.id}`,
      lastmod: toW3CDate(row.updated_at),
      changefreq: "monthly",
      priority: "0.7",
    }));
  }

  // Dynamic: board submissions (boards/:slug)
  const boardsResult = await client.query(
    `SELECT slug, updated_at FROM board_submissions ORDER BY created_at DESC`
  );
  for (const row of boardsResult.rows) {
    urls.push(buildUrlEntry({
      loc: `${BASE_URL}/boards/${encodeURIComponent(row.slug)}`,
      lastmod: toW3CDate(row.updated_at),
      changefreq: "weekly",
      priority: "0.6",
    }));
  }

  await client.end();

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    "</urlset>",
  ].join("\n");

  fs.writeFileSync(OUTPUT_PATH, xml, "utf8");

  const counts = {
    static: STATIC_ROUTES.length,
    meetings: meetingsResult.rows.length,
    votes: votesResult.rows.length,
    members: membersResult.rows.length,
    boards: boardsResult.rows.length,
    total: urls.length,
  };

  console.log("Sitemap written to:", OUTPUT_PATH);
  console.log("URL counts:", JSON.stringify(counts, null, 2));
}

main().catch((err) => {
  console.error("Sitemap generation failed:", err);
  process.exit(1);
});
