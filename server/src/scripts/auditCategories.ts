/**
 * auditCategories.ts
 *
 * Finds all vote items that categorize as "Other / Needs Review" and
 * groups them by item_title, showing count and a sample motion_text.
 *
 * Usage (from server/):
 *   npx tsx src/scripts/auditCategories.ts
 */

import "../config/env"; // load .env before anything else
import { db } from "../db";
import { categorizeVoteItemText } from "../utils/boardVotes";

const SAMPLE_LEN = 100;

const main = async () => {
  const items = await db.query.voteItems.findMany({
    columns: {
      id: true,
      itemTitle: true,
      motionText: true,
      summaryText: true,
      sourceExcerpt: true,
    },
    orderBy: (vi, { asc }) => [asc(vi.id)],
  });

  console.log(`\nLoaded ${items.length} vote items from DB.`);

  // Group "Other / Needs Review" items by item_title
  const groups = new Map<
    string,
    { count: number; sampleMotion: string | null }
  >();

  for (const item of items) {
    const result = categorizeVoteItemText({
      itemTitle: item.itemTitle,
      motionText: item.motionText,
      summaryText: item.summaryText,
      sourceExcerpt: item.sourceExcerpt,
    });

    if (result.category !== "Other / Needs Review") continue;

    const title = item.itemTitle ?? "(no title)";
    const existing = groups.get(title);
    if (!existing) {
      const sample = item.motionText
        ? item.motionText.slice(0, SAMPLE_LEN)
        : null;
      groups.set(title, { count: 1, sampleMotion: sample });
    } else {
      existing.count += 1;
    }
  }

  const totalNeedsReview = Array.from(groups.values()).reduce(
    (sum, g) => sum + g.count,
    0,
  );

  console.log(
    `Other / Needs Review: ${totalNeedsReview} of ${items.length} items (${((totalNeedsReview / items.length) * 100).toFixed(1)}%)`,
  );
  console.log(`Distinct titles: ${groups.size}\n`);

  // Sort by count descending
  const sorted = Array.from(groups.entries()).sort(
    (a, b) => b[1].count - a[1].count,
  );

  // Print table header
  const countW = 6;
  const titleW = 60;
  const motionW = 100;
  const header =
    "COUNT ".padStart(countW) +
    "  " +
    "ITEM_TITLE".padEnd(titleW) +
    "  " +
    "SAMPLE_MOTION";
  console.log(header);
  console.log("-".repeat(countW + 2 + titleW + 2 + motionW));

  for (const [title, { count, sampleMotion }] of sorted) {
    const countStr = String(count).padStart(countW);
    const titleStr = title.length > titleW ? title.slice(0, titleW - 1) + "…" : title.padEnd(titleW);
    const motionStr = sampleMotion
      ? sampleMotion.replace(/\n/g, " ").trim()
      : "(no motion)";
    console.log(`${countStr}  ${titleStr}  ${motionStr}`);
  }

  console.log(`\nTotal "Other / Needs Review": ${totalNeedsReview}`);
  console.log(`All ${sorted.length} unique titles shown above (sorted by frequency).`);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
