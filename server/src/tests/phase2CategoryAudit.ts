const API_BASE = process.env.API_BASE ?? "http://127.0.0.1:4000/api";

const allowedCategories = new Set([
  "Personnel",
  "Contracts / Procurement",
  "Budget / Finance",
  "Facilities / Construction",
  "Policy / Governance",
  "Curriculum / Instruction",
  "Student Services",
  "Safety / Security",
  "Transportation",
  "Technology",
  "Legal / Compliance",
  "Athletics / Extracurricular",
  "Operations / Administration",
  "Other",
  "Needs review",
]);

const leakPattern =
  /(^|\b)(Voting:|Motion seconded by|Motion made by|Unanimously Approved|ACTION AGENDA|SUPERINTENDENT RECOMMENDATIONS|Yes:\s*[A-Z]|No:\s*[A-Z]|Abstain:\s*[A-Z])(\b|$)/i;

type VoteItem = {
  id: number;
  category?: string | null;
  categoryConfidence?: number | string | null;
  verificationStatus?: string | null;
  confidenceScore?: number | string | null;
  sourceUrl?: string | null;
  sourceAvailability?: "available" | "unavailable" | string | null;
  sourceLabel?: string | null;
  itemTitle?: string | null;
  motionMadeBy?: string | null;
  motionSecondedBy?: string | null;
  motionText?: string | null;
  summaryText?: string | null;
  sourceExcerpt?: string | null;
  result?: string | null;
  meeting?: {
    sourceUrl?: string | null;
  } | null;
  voteRecords?: Array<Record<string, unknown>>;
};

type MemberDetail = {
  id: number;
  name: string;
  noVoteItems?: Array<{
    voteItemId: number;
    category?: string | null;
    categoryConfidence?: number | string | null;
    verificationStatus?: string | null;
    confidenceScore?: number | string | null;
    sourceUrl?: string | null;
    sourceAvailability?: "available" | "unavailable" | string | null;
    sourceLabel?: string | null;
    itemTitle?: string | null;
    motionText?: string | null;
    summaryText?: string | null;
    sourceExcerpt?: string | null;
    overallOutcome?: string | null;
  }>;
};

type MemberStat = { memberId: number; name: string };

type SummaryPayload = {
  recentVotes: VoteItem[];
};

const getJson = async <T>(path: string): Promise<T> => {
  const response = await fetch(`${API_BASE}${path}`);
  if (!response.ok) throw new Error(`GET ${path} failed: ${response.status}`);
  return (await response.json()) as T;
};

const normalizeCategory = (value?: string | null) => value?.trim() || "";

const isValidCategory = (value?: string | null) => {
  const category = normalizeCategory(value);
  return category.length > 0 && allowedCategories.has(category);
};

const hasVisibleSourceState = (item: {
  sourceUrl?: string | null;
  sourceAvailability?: string | null;
  sourceLabel?: string | null;
  meeting?: { sourceUrl?: string | null } | null;
}) => {
  const sourceUrl = item.sourceUrl ?? item.meeting?.sourceUrl ?? null;
  const sourceAvailability = item.sourceAvailability ?? null;
  const sourceLabel = item.sourceLabel ?? null;

  if (sourceUrl && /^https?:\/\//i.test(sourceUrl)) return true;
  if (sourceAvailability === "unavailable") return true;
  if (typeof sourceLabel === "string" && /source unavailable/i.test(sourceLabel)) return true;
  return false;
};

const scanVoteFieldsForLeaks = (item: unknown) => {
  const findings: Array<{ field: string; value: string }> = [];

  const visit = (value: unknown, path: string) => {
    if (typeof value === "string") {
      if (leakPattern.test(value)) {
        findings.push({ field: path || "value", value: value.slice(0, 240) });
      }
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((entry, index) => visit(entry, `${path}[${index}]`));
      return;
    }

    if (value && typeof value === "object") {
      Object.entries(value).forEach(([key, entry]) => visit(entry, path ? `${path}.${key}` : key));
    }
  };

  visit(item, "");
  return findings;
};

const main = async () => {
  const [votes, summary, members, recentVotes] = await Promise.all([
    getJson<VoteItem[]>("/votes?nonUnanimousOnly=false&limit=200"),
    getJson<SummaryPayload>("/stats"),
    getJson<MemberStat[]>("/members"),
    getJson<VoteItem[]>("/recentVotes"),
  ]);

  const voteDetails = await Promise.all(votes.map((vote) => getJson<VoteItem>(`/votes/${vote.id}`)));
  const memberDetails = await Promise.all(members.map((member) => getJson<MemberDetail>(`/members/${member.memberId}`)));

  const categoryCounts = new Map<string, number>();
  const incrementCategory = (category: string) => {
    categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
  };

  let needsReviewCount = 0;

  const missingCategoryVotes: Array<{ endpoint: string; id: number }> = [];
  const missingAuditVotes: Array<{ endpoint: string; id: number; reason: string }> = [];
  const leakFindings: Array<{ endpoint: string; id: number; field: string; value: string }> = [];

  const scanVoteCollection = (endpoint: string, items: VoteItem[]) => {
    items.forEach((item) => {
      if (!isValidCategory(item.category)) {
        missingCategoryVotes.push({ endpoint, id: item.id });
      } else {
        const category = normalizeCategory(item.category);
        incrementCategory(category);
        if (category === "Needs review") needsReviewCount += 1;
      }

      if (!item.verificationStatus) {
        missingAuditVotes.push({ endpoint, id: item.id, reason: "missing verificationStatus" });
      }

      if (!("confidenceScore" in item)) {
        missingAuditVotes.push({ endpoint, id: item.id, reason: "missing confidenceScore field" });
      }

      if (!hasVisibleSourceState(item)) {
        missingAuditVotes.push({ endpoint, id: item.id, reason: "missing sourceUrl/source unavailable state" });
      }

      scanVoteFieldsForLeaks(item).forEach((finding) => {
        leakFindings.push({ endpoint, id: item.id, field: finding.field, value: finding.value });
      });
    });
  };

  scanVoteCollection("/votes", votes);
  scanVoteCollection("/stats recentVotes", summary.recentVotes);
  scanVoteCollection("/recentVotes", recentVotes);
  scanVoteCollection("/votes/:id", voteDetails);

  const memberNoVoteIssues: Array<{ memberId: number; voteItemId: number; reason: string }> = [];

  memberDetails.forEach((member) => {
    (member.noVoteItems ?? []).forEach((item) => {
      if (!isValidCategory(item.category)) {
        memberNoVoteIssues.push({ memberId: member.id, voteItemId: item.voteItemId, reason: "missing/invalid category" });
      } else if (normalizeCategory(item.category) === "Needs review") {
        needsReviewCount += 1;
      }

      incrementCategory(normalizeCategory(item.category || "Needs review"));

      if (!item.verificationStatus) {
        memberNoVoteIssues.push({ memberId: member.id, voteItemId: item.voteItemId, reason: "missing verificationStatus" });
      }

      if (!("confidenceScore" in item)) {
        memberNoVoteIssues.push({ memberId: member.id, voteItemId: item.voteItemId, reason: "missing confidenceScore field" });
      }

      if (!hasVisibleSourceState(item)) {
        memberNoVoteIssues.push({ memberId: member.id, voteItemId: item.voteItemId, reason: "missing source state" });
      }

      scanVoteFieldsForLeaks(item).forEach((finding) => {
        leakFindings.push({
          endpoint: `/members/${member.id} noVoteItems`,
          id: item.voteItemId,
          field: finding.field,
          value: finding.value,
        });
      });
    });
  });

  const categoryCountsObject = Object.fromEntries(
    Array.from(categoryCounts.entries()).sort((a, b) => a[0].localeCompare(b[0])),
  );

  console.log(
    JSON.stringify(
      {
        totals: {
          votesList: votes.length,
          recentVotes: summary.recentVotes.length,
          recentVotesEndpoint: recentVotes.length,
          voteDetails: voteDetails.length,
          members: members.length,
          memberNoVoteItems: memberDetails.reduce((sum, member) => sum + (member.noVoteItems?.length ?? 0), 0),
        },
        categoryCounts: categoryCountsObject,
        needsReviewCount,
        missingCategoryCount: missingCategoryVotes.length,
        missingCategoryVotes,
        missingAuditCount: missingAuditVotes.length + memberNoVoteIssues.length,
        missingAuditVotes,
        memberNoVoteIssues,
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
