import { and, eq } from "drizzle-orm";
import { db, schema } from "../db";
import {
  canonicalizeBoardMemberName,
  mergeBoardMemberAliases,
} from "../utils/boardMembers";

type MergeSummary = {
  canonicalName: string;
  mergedNames: string[];
};

const main = async () => {
  const members = await db.select().from(schema.boardMembers);
  const before = members.map((member) => ({
    id: member.id,
    name: member.name,
    aliases: member.aliases,
  }));

  const grouped = new Map<string, typeof members>();
  members.forEach((member) => {
    const canonicalName = canonicalizeBoardMemberName(member.name);
    grouped.set(canonicalName, [...(grouped.get(canonicalName) ?? []), member]);
  });

  const mergeSummaries: MergeSummary[] = [];

  for (const [canonicalName, group] of grouped.entries()) {
    if (group.length <= 1) continue;

    const canonicalMember =
      group.find((member) => member.name === canonicalName) ??
      [...group].sort((left, right) => left.id - right.id)[0];
    if (!canonicalMember) continue;

    const duplicateMembers = group.filter((member) => member.id !== canonicalMember.id);
    if (duplicateMembers.length === 0) continue;

    await db.transaction(async (tx) => {
      let currentAliases = [...canonicalMember.aliases];

      for (const duplicate of duplicateMembers) {
        const duplicateVoteRecords = await tx
          .select()
          .from(schema.voteRecords)
          .where(eq(schema.voteRecords.boardMemberId, duplicate.id));

        for (const voteRecord of duplicateVoteRecords) {
          const existingCanonicalRecord = await tx
            .select()
            .from(schema.voteRecords)
            .where(
              and(
                eq(schema.voteRecords.voteItemId, voteRecord.voteItemId),
                eq(schema.voteRecords.boardMemberId, canonicalMember.id),
              ),
            );

          if (existingCanonicalRecord.length > 0) {
            await tx
              .delete(schema.voteRecords)
              .where(eq(schema.voteRecords.id, voteRecord.id));
            continue;
          }

          await tx
            .update(schema.voteRecords)
            .set({ boardMemberId: canonicalMember.id })
            .where(eq(schema.voteRecords.id, voteRecord.id));
        }

        await tx
          .update(schema.voteItems)
          .set({ motionMadeByMemberId: canonicalMember.id })
          .where(eq(schema.voteItems.motionMadeByMemberId, duplicate.id));

        await tx
          .update(schema.voteItems)
          .set({ motionSecondedByMemberId: canonicalMember.id })
          .where(eq(schema.voteItems.motionSecondedByMemberId, duplicate.id));

        const mergedAliases = mergeBoardMemberAliases(currentAliases, duplicate.name);
        duplicate.aliases.forEach((alias) => {
          mergedAliases.push(alias);
        });
        currentAliases = [...new Set(mergedAliases)];

        await tx
          .update(schema.boardMembers)
          .set({
            name: canonicalName,
            aliases: currentAliases,
            updatedAt: new Date(),
          })
          .where(eq(schema.boardMembers.id, canonicalMember.id));

        await tx
          .delete(schema.boardMembers)
          .where(eq(schema.boardMembers.id, duplicate.id));
      }
    });

    mergeSummaries.push({
      canonicalName,
      mergedNames: duplicateMembers.map((member) => member.name),
    });
  }

  const afterStats = await db
    .select({
      id: schema.boardMembers.id,
      name: schema.boardMembers.name,
      aliases: schema.boardMembers.aliases,
    })
    .from(schema.boardMembers);

  console.log(
    JSON.stringify(
      {
        before,
        mergeSummaries,
        after: afterStats,
      },
      null,
      2,
    ),
  );
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
