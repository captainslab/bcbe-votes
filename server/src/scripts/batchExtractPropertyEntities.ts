/**
 * Batch-extracts property entities for all vote items that:
 * - Have a property-pattern title or agenda section
 * - Have summaryText, motionText, contentText, or sourceExcerpt available
 * - Have property_entities IS NULL (not yet processed)
 *
 * Safe to run repeatedly — skips items already populated.
 */

import { and, isNull, or, sql, eq } from "drizzle-orm";
import { db, schema } from "../db";
import { extractPropertyEntities } from "../services/propertyEntityService";

const PROPERTY_PATTERN = /\b(property|real\s+estate|lease|easement|conveyance|purchase\s+agreement|deed|facility|facilities|construction|renovation|site\s+survey|building|capital\s+improvement|public\s+works|architect|engineering\s+services)\b/i;

const main = async () => {
  const candidates = await db.query.voteItems.findMany({
    where: and(
      isNull(schema.voteItems.propertyEntities),
      or(
        sql`${schema.voteItems.itemTitle} ~* '\\y(property|real\\s+estate|lease|easement|conveyance|purchase|deed|facility|facilities|construction|renovation|site\\s+survey|building|capital\\s+improvement)\\y'`,
        sql`${schema.voteItems.agendaSection} ~* '\\y(property|real\\s+estate|lease|easement|conveyance|purchase|deed|facility|facilities|construction|renovation)\\y'`,
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

  console.log(`Found ${candidates.length} property vote items without entities\n`);

  let extracted = 0;
  let skipped = 0;
  let failed = 0;

  for (const item of candidates) {
    if (!PROPERTY_PATTERN.test(`${item.itemTitle} ${item.agendaSection ?? ""}`)) {
      skipped += 1;
      continue;
    }

    const entities = await extractPropertyEntities({
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
        .set({ propertyEntities: entities })
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
