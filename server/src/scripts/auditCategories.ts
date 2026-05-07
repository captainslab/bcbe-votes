/**
 * auditCategories.ts
 *
 * Offline category-quality audit — runs against the local DB without a running
 * server.  Reports category distribution, low-confidence items, and title-prefix
 * leakage per the team-lead spec.
 *
 * Usage:
 *   npx tsx src/scripts/auditCategories.ts
 */

import { db } from "../db";
import { categorizeVoteItemText } from "../utils/boardVotes";
import { normalizeWhitespace } from "../utils/text";

const TITLE_PREFIX_PATTERN = /\b(Mr|Mrs|Ms|Miss|Dr)\.?\s+[A-Z]/;

const main = async () => {
  const items = await db.query.voteItems.findMany({
    columns: {
      id: true,
      itemTitle: true,
      motionText: true,
      summaryText: true,
      sourceExcerpt: true,
      detectedPattern: true,
      confidenceScore: true,
    },
    with: {
      meeting: { columns: { date: true, simbliId: true } },
    },
    orderBy: (vi, { asc }) => [asc(vi.id)],
  });

  const categoryCounts = new Map<string, number>();
  const lowConfidence: Array<{ id: number; title: string; category: string; confidence: number; date: string }> = [];
  const titlePrefixHits: Array<{ id: number; title: string; field: string; value: string }> = [];

  let historical = 0;
  let historicalNeedsReview = 0;

  for (const item of items) {
    const result = categorizeVoteItemText({
      itemTitle: item.itemTitle,
      motionText: item.motionText,
      summaryText: item.summaryText,
      sourceExcerpt: item.sourceExcerpt,
    });

    categoryCounts.set(result.category, (categoryCounts.get(result.category) ?? 0) + 1);

    if (result.categoryConfidence < 0.6) {
      lowConfidence.push({
        id: item.id,
        title: normalizeWhitespace(item.itemTitle ?? "") || "(no title)",
        category: result.category,
        confidence: result.categoryConfidence,
        date: item.meeting?.date ? new Date(item.meeting.date).toISOString().slice(0, 10) : "unknown",
      });
    }

    // Historical: simbliId numeric value roughly corresponds to pre-2024 meetings
    const meetingDate = item.meeting?.date ? new Date(item.meeting.date) : null;
    if (meetingDate && meetingDate.getFullYear() <= 2023) {
      historical += 1;
      if (result.category === "Other / Needs Review") historicalNeedsReview += 1;
    }

    // Title-prefix scan on itemTitle only — this field appears in public output without
    // full API-layer sanitization. summaryText/sourceExcerpt are sanitized before serving.
    if (item.itemTitle && TITLE_PREFIX_PATTERN.test(item.itemTitle)) {
      titlePrefixHits.push({ id: item.id, title: item.itemTitle, field: "itemTitle", value: item.itemTitle.slice(0, 120) });
    }
  }

  const sortedCounts = Array.from(categoryCounts.entries()).sort((a, b) => b[1] - a[1]);
  const needsReviewCount = categoryCounts.get("Other / Needs Review") ?? 0;
  const top20LowConf = lowConfidence
    .sort((a, b) => a.confidence - b.confidence)
    .slice(0, 20);

  console.log("\n=== CATEGORY AUDIT ===\n");
  console.log(`Total vote_items: ${items.length}`);
  console.log(`Categorized (not Other / Needs Review): ${items.length - needsReviewCount}`);
  console.log(`Other / Needs Review: ${needsReviewCount} (${((needsReviewCount / items.length) * 100).toFixed(1)}%)`);
  console.log(`Historical (≤2023): ${historical} items, ${historicalNeedsReview} need review`);

  console.log("\n--- Category distribution ---");
  for (const [cat, count] of sortedCounts) {
    const pct = ((count / items.length) * 100).toFixed(1);
    console.log(`  ${cat.padEnd(30)} ${String(count).padStart(5)}  (${pct}%)`);
  }

  console.log(`\n--- Top ${top20LowConf.length} low-confidence items (confidence < 0.6) ---`);
  for (const item of top20LowConf) {
    console.log(`  [${item.id}] ${item.date}  conf=${item.confidence.toFixed(2)}  cat=${item.category}`);
    console.log(`       "${item.title.slice(0, 80)}"`);
  }

  if (titlePrefixHits.length === 0) {
    console.log("\n--- Title-prefix scan: CLEAN (no Mr/Mrs/Ms/Miss/Dr hits) ---");
  } else {
    console.log(`\n--- Title-prefix scan: ${titlePrefixHits.length} HIT(S) ---`);
    for (const hit of titlePrefixHits.slice(0, 20)) {
      console.log(`  [${hit.id}] field=${hit.field}: "${hit.value}"`);
    }
  }

  console.log("\n=== END AUDIT ===\n");

  if (titlePrefixHits.length > 0) process.exit(1);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
