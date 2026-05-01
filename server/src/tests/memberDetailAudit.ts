import { getMemberStats, getPairwiseAlignment } from "../services/analyticsService";
import { getMemberNoVoteItems } from "../services/dataService";

const canonical = [
  "Ken Bradley",
  "Andrea Lindsey",
  "Tony Myrick",
  "Rondi Kirby",
  "Jason P. Woerner",
  "Cecil Christenberry",
  "April Bradley",
];

const main = async () => {
  const stats = await getMemberStats();
  const alignment = await getPairwiseAlignment();
  const names = [...new Set(stats.map((s) => s.name))].sort();
  const extras = names.filter((name) => !canonical.includes(name));
  const leaks = stats
    .filter((s) =>
      /(^|\b)(Mike Johnson|Voting:|Motion seconded by|Unanimously Approved|ACTION AGENDA|SUPERINTENDENT RECOMMENDATIONS|Mrs\.?|Ms\.?|Mr\.?|Miss|Dr\.?)(\b|$)/i.test(
        s.name,
      ),
    )
    .map((s) => s.name);

  const needsReviewRows = await Promise.all(
    stats.map(async (s) => ({
      name: s.name,
      count: (await getMemberNoVoteItems(s.memberId)).filter(
        (i) =>
          i.verificationStatus !== "verified" ||
          i.category === "Needs review" ||
          i.sourceAvailability === "unavailable" ||
          i.overallOutcome === "Needs review",
      ).length,
    })),
  );

  console.log(
    JSON.stringify(
      {
        names,
        extras,
        leaks,
        orphanPairs: alignment.filter(
          (p) => !stats.some((s) => s.memberId === p.memberAId) || !stats.some((s) => s.memberId === p.memberBId),
        ).length,
        needsReviewRows,
      },
      null,
      2,
    ),
  );
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
