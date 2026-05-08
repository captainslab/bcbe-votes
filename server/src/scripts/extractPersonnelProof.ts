import { eq } from "drizzle-orm";
import { db, schema } from "../db";
import { extractPersonnelEntities } from "../services/personnelEntityService";

const main = async () => {
  const item = await db.query.voteItems.findFirst({
    where: eq(schema.voteItems.id, 571),
    columns: { id: true, itemTitle: true, agendaSection: true, contentText: true, summaryText: true, motionText: true, sourceExcerpt: true },
  });
  console.log("Item:", item?.itemTitle, "| contentText length:", item?.contentText?.length ?? 0);

  const entities = await extractPersonnelEntities({
    itemTitle: "APPOINTMENTS/ASSIGNMENTS - CLASSIFIED PERSONNEL",
    agendaSection: item?.agendaSection,
    contentText: item?.contentText,
    summaryText: item?.summaryText,
    motionText: item?.motionText,
    sourceExcerpt: item?.sourceExcerpt,
  });
  console.log("Extracted entities:", JSON.stringify(entities, null, 2));

  if (entities && entities.length > 0) {
    await db.update(schema.voteItems).set({ personnelEntities: entities }).where(eq(schema.voteItems.id, 571));
    console.log("Saved to DB.");

    const saved = await db.query.voteItems.findFirst({
      where: eq(schema.voteItems.id, 571),
      columns: { personnelEntities: true },
    });
    console.log("Verified in DB:", JSON.stringify(saved?.personnelEntities, null, 2));
  }
};

main()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => process.exit(process.exitCode ?? 0));
