const API_BASE = process.env.API_BASE ?? "http://127.0.0.1:4000/api";

const canonicalMembers = [
  "Ken Bradley",
  "Andrea Lindsey",
  "Tony Myrick",
  "Rondi Kirby",
  "Jason P. Woerner",
  "Cecil Christenberry",
  "April Bradley",
] as const;

const canonicalSet = new Set(canonicalMembers);
const parserArtifactPattern =
  /(^|\b)(Mike Johnson|Voting:|Motion seconded by|Motion made by|Unanimously Approved|ACTION AGENDA|SUPERINTENDENT RECOMMENDATIONS|Mrs\.?|Ms\.?|Mr\.?|Miss|Dr\.?)(\b|$)/i;

type MemberStat = {
  memberId: number;
  name: string;
};

type SharedVote = {
  voteItemId: number;
  meetingId: number;
  meetingDate: string;
  meetingTitle: string;
  meetingType: string;
  displayText: string;
  itemTitle: string;
  motionText: string;
  summaryText: string;
  result: string;
  isNonUnanimous: boolean;
  category: string;
  categoryConfidence: number;
  verificationStatus: string;
  confidenceScore: number | string | null;
  sourceUrl: string | null;
  sourceAvailability: "available" | "unavailable";
  sourceLabel: string;
  memberAVote: string;
  memberBVote: string;
};

type PairwiseAlignment = {
  memberAId: number;
  memberBId: number;
  memberAName?: string;
  memberBName?: string;
  sameVotes: number;
  differentVotes: number;
  splitVotes?: number;
  overlap: number;
  alignmentRate: number;
  splitRate: number;
  categoriesRepresented?: string[];
  sharedVotes?: SharedVote[];
};

const getJson = async <T>(path: string): Promise<T> => {
  const response = await fetch(`${API_BASE}${path}`);
  if (!response.ok) throw new Error(`GET ${path} failed: ${response.status}`);
  return (await response.json()) as T;
};

const isValidSourceState = (vote: SharedVote) => {
  if (vote.sourceUrl && /^https?:\/\//i.test(vote.sourceUrl)) return true;
  if (vote.sourceAvailability === "unavailable") return true;
  if (/source unavailable/i.test(vote.sourceLabel || "")) return true;
  return false;
};

const scanLeakFields = (vote: SharedVote) => {
  const fields: Array<[string, unknown]> = [
    ["displayText", vote.displayText],
    ["itemTitle", vote.itemTitle],
    ["motionText", vote.motionText],
    ["summaryText", vote.summaryText],
    ["result", vote.result],
    ["meetingTitle", vote.meetingTitle],
    ["meetingType", vote.meetingType],
  ];

  return fields
    .filter(([, value]) => typeof value === "string" && parserArtifactPattern.test(value))
    .map(([field, value]) => ({ field, value: String(value).slice(0, 240) }));
};

const main = async () => {
  const [members, alignments] = await Promise.all([
    getJson<MemberStat[]>("/members"),
    getJson<PairwiseAlignment[]>("/alliances"),
  ]);

  const memberNameById = new Map<number, string>(members.map((member) => [member.memberId, member.name]));

  const canonicalMemberNames = Array.from(new Set(members.map((member) => member.name))).sort();
  const nonCanonicalMembers = canonicalMemberNames.filter((name) => !canonicalSet.has(name as (typeof canonicalMembers)[number]));

  const orphanPairs: Array<{ memberAId: number; memberBId: number }> = [];
  const nonCanonicalPairs: Array<{ memberAId: number; memberBId: number; memberAName: string; memberBName: string }> = [];
  const missingSharedVotes: Array<{ memberAId: number; memberBId: number }> = [];
  const invalidAuditVotes: Array<{ memberAId: number; memberBId: number; voteItemId: number; reason: string }> = [];
  const leakFindings: Array<{ memberAId: number; memberBId: number; voteItemId: number; field: string; value: string }> = [];

  alignments.forEach((pair) => {
    const memberAName = pair.memberAName ?? memberNameById.get(pair.memberAId) ?? "";
    const memberBName = pair.memberBName ?? memberNameById.get(pair.memberBId) ?? "";

    if (!memberAName || !memberBName) {
      orphanPairs.push({ memberAId: pair.memberAId, memberBId: pair.memberBId });
      return;
    }

    if (!canonicalSet.has(memberAName as (typeof canonicalMembers)[number]) || !canonicalSet.has(memberBName as (typeof canonicalMembers)[number])) {
      nonCanonicalPairs.push({
        memberAId: pair.memberAId,
        memberBId: pair.memberBId,
        memberAName,
        memberBName,
      });
    }

    if (parserArtifactPattern.test(memberAName) || parserArtifactPattern.test(memberBName)) {
      nonCanonicalPairs.push({
        memberAId: pair.memberAId,
        memberBId: pair.memberBId,
        memberAName,
        memberBName,
      });
    }

    const sharedVotes = pair.sharedVotes ?? [];
    if (sharedVotes.length === 0) {
      missingSharedVotes.push({ memberAId: pair.memberAId, memberBId: pair.memberBId });
      return;
    }

    sharedVotes.forEach((vote) => {
      if (!vote.category) {
        invalidAuditVotes.push({
          memberAId: pair.memberAId,
          memberBId: pair.memberBId,
          voteItemId: vote.voteItemId,
          reason: "missing category",
        });
      }

      const voteRecord = vote as Record<string, unknown>;
      if (!Object.prototype.hasOwnProperty.call(voteRecord, "confidenceScore")) {
        invalidAuditVotes.push({
          memberAId: pair.memberAId,
          memberBId: pair.memberBId,
          voteItemId: vote.voteItemId,
          reason: "missing confidenceScore field",
        });
      }

      if (!vote.verificationStatus) {
        invalidAuditVotes.push({
          memberAId: pair.memberAId,
          memberBId: pair.memberBId,
          voteItemId: vote.voteItemId,
          reason: "missing verificationStatus",
        });
      }

      if (!isValidSourceState(vote)) {
        invalidAuditVotes.push({
          memberAId: pair.memberAId,
          memberBId: pair.memberBId,
          voteItemId: vote.voteItemId,
          reason: "missing sourceUrl/source unavailable state",
        });
      }

      scanLeakFields(vote).forEach((finding) => {
        leakFindings.push({
          memberAId: pair.memberAId,
          memberBId: pair.memberBId,
          voteItemId: vote.voteItemId,
          field: finding.field,
          value: finding.value,
        });
      });
    });
  });

  console.log(
    JSON.stringify(
      {
        pairCount: alignments.length,
        canonicalMemberCount: canonicalMemberNames.length,
        canonicalMembers: canonicalMemberNames,
        nonCanonicalMembers,
        orphanPairCount: orphanPairs.length,
        orphanPairs,
        nonCanonicalPairCount: nonCanonicalPairs.length,
        nonCanonicalPairs,
        missingSharedVotesCount: missingSharedVotes.length,
        missingSharedVotes,
        invalidAuditVoteCount: invalidAuditVotes.length,
        invalidAuditVotes,
        leakCount: leakFindings.length,
        leakFindings,
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

export {};
