/**
 * Batch-extracts personnel entities for all vote items that:
 * - Have a personnel-pattern title or agenda section
 * - Have contentText, summaryText, or motionText available
 * - Have personnel_entities IS NULL (not yet processed)
 *
 * Safe to run repeatedly — skips items already populated.
 */

import { and, isNull, or, sql } from "drizzle-orm";
import { db, schema } from "../db";
import { extractPersonnelEntities } from "../services/personnelEntityService";
import { eq } from "drizzle-orm";

const PERSONNEL_PATTERN = /\b(personnel|hire|hiring|employ|resign|termination|retirement|retire|suspension|transfer|leaves?\s+of\s+absence|classified|certified|appoint)\b/i;

const main = async () => {
  const candidates = await db.query.voteItems.findMany({
    where: and(
      isNull(schema.voteItems.personnelEntities),
      or(
        sql`${schema.voteItems.itemTitle} ~* '\\y(personnel|hire|hiring|employ|resign|termination|retirement|retire|suspension|transfer|classified|certified|appoint)\\y'`,
        sql`${schema.voteItems.agendaSection} ~* '\\y(personnel|hire|hiring|employ|resign|termination|retirement|retire|suspension|transfer|classified|certified|appoint)\\y'`,
      ),
    ),
    columns: {
      id: true,
      itemTitle: true,
      agendaSection: true,
      contentText: true,
      summaryText: true,
      motionText: true,
      sourceExcerpt: true,
    },
  });

  console.log(`Found ${candidates.length} personnel vote items without entities\n`);

  let extracted = 0;
  let skipped = 0;
  let failed = 0;

  for (const item of candidates) {
    if (!PERSONNEL_PATTERN.test(`${item.itemTitle} ${item.agendaSection ?? ""}`)) {
      skipped += 1;
      continue;
    }

    const entities = await extractPersonnelEntities({
      itemTitle: item.itemTitle,
      agendaSection: item.agendaSection,
      contentText: item.contentText,
      summaryText: item.summaryText,
      motionText: item.motionText,
      sourceExcerpt: item.sourceExcerpt,
    });

    if (entities === null) {
      skipped += 1;
      continue;
    }

    try {
      await db
        .update(schema.voteItems)
        .set({ personnelEntities: entities })
        .where(eq(schema.voteItems.id, item.id));

      console.log(`  id=${item.id} "${item.itemTitle}" → ${entities.length} entities`);
      extracted += 1;
    } catch (err) {
      console.error(`  id=${item.id} failed to save: ${(err as Error).message}`);
      failed += 1;
    }

    // Respect rate limits
    await new Promise((r) => setTimeout(r, 200));
  }

  console.log(`\nDone: extracted=${extracted} skipped=${skipped} failed=${failed}`);
};

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => process.exit(process.exitCode ?? 0));
