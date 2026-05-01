import { getMemberStats, getPairwiseAlignment } from "../services/analyticsService";
import { getMember, getMemberNoVoteItems } from "../services/dataService";

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
  const orphanPairs = alignment.filter(
    (p) => !stats.some((s) => s.memberId === p.memberAId) || !stats.some((s) => s.memberId === p.memberBId),
  ).length;

  const pack = async (name: string) => {
    const stat = stats.find((s) => s.name === name);
    if (!stat) return { name, found: false };
    const member = await getMember(stat.memberId);
    const items = await getMemberNoVoteItems(stat.memberId);
    return {
      name,
      found: true,
      memberId: stat.memberId,
      canonicalName: member?.name,
      noVoteCount: items.length,
      sample: items.slice(0, 3).map((i) => ({
        meetingDate: i.meetingDate,
        meetingType: i.meetingType,
        itemTitle: i.itemTitle,
        category: i.category,
        memberVote: i.memberVote,
        outcome: i.overallOutcome,
        sourceUrl: i.sourceUrl,
        verificationStatus: i.verificationStatus,
        confidenceScore: i.confidenceScore,
      })),
    };
  };

  console.log(
    JSON.stringify(
      {
        names,
        extras,
        leaks,
        orphanPairs,
        april: await pack("April Bradley"),
        tony: await pack("Tony Myrick"),
        jason: await pack("Jason P. Woerner"),
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
