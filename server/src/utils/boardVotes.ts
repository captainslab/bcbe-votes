import { normalizeWhitespace } from "./text";
import { normalizeVoteValue } from "./votes";

export const canonicalBoardMembers = [
  "Ken Bradley",
  "Andrea Lindsey",
  "Tony Myrick",
  "Rondi Kirby",
  "Jason P. Woerner",
  "Cecil Christenberry",
  "April Bradley",
] as const;

export type CanonicalBoardMemberName = (typeof canonicalBoardMembers)[number];

const honorificPattern = /\b(?:mrs|ms|mr|miss|dr)\.?\s*/gi;
const parserArtifactPatterns = [
  /\bvoting\s*:/i,
  /motion made by/i,
  /motion seconded by/i,
  /unanimously approved/i,
  /action agenda/i,
  /superintendent recommendations/i,
];

const memberAliasMap: Record<string, CanonicalBoardMemberName> = {
  "ken bradley": "Ken Bradley",
  "kenneth bradley": "Ken Bradley",
  "andre a lindsey": "Andrea Lindsey",
  "andrea lindsey": "Andrea Lindsey",
  "tony myrick": "Tony Myrick",
  "rondi kirby": "Rondi Kirby",
  "jason woerner": "Jason P. Woerner",
  "jason p. woerner": "Jason P. Woerner",
  "cecil christenberry": "Cecil Christenberry",
  "april bradley": "April Bradley",
};

export type VoteItemCategory =
  | "Personnel"
  | "Contracts / Procurement"
  | "Budget / Finance"
  | "Facilities / Construction"
  | "Policy / Governance"
  | "Curriculum / Instruction"
  | "Student Services"
  | "Safety / Security"
  | "Transportation"
  | "Technology"
  | "Legal / Compliance"
  | "Athletics / Extracurricular"
  | "Operations / Administration"
  | "Other"
  | "Needs review";

export type SourceAuditInfo = {
  sourceUrl: string | null;
  sourceAvailability: "available" | "unavailable";
  sourceLabel: string;
};

export const getCanonicalBoardMemberName = (rawName?: string | null): CanonicalBoardMemberName | null => {
  const normalized = normalizeWhitespace(rawName).replace(honorificPattern, "").trim();
  if (!normalized) return null;
  if (parserArtifactPatterns.some((pattern) => pattern.test(normalized))) return null;
  const alias = memberAliasMap[normalized.toLowerCase()];
  if (alias) return alias;
  return canonicalBoardMembers.includes(normalized as CanonicalBoardMemberName)
    ? (normalized as CanonicalBoardMemberName)
    : null;
};

const categoryParserArtifactPatterns = [
  /motion made by/i,
  /motion seconded by/i,
  /\bvoting\s*:/i,
  /unanimously approved/i,
  /action agenda/i,
  /superintendent recommendations/i,
  /all voiced approval/i,
  /declared the motion carries/i,
  /(?:^|\s)[A-Z][a-z]+(?:\s+[A-Z][a-z.]+){0,3}\s*-\s*(?:Yes|No|Abstain|Recused|Absent)\b/,
  /\b(?:Yes|No|Abstain|Recused|Absent):\s*[A-Z]/,
] as const;

const categoryRules: Array<{ category: VoteItemCategory; patterns: RegExp[] }> = [
  {
    category: "Personnel",
    patterns: [/\b(personnel|hire|hiring|employment|resign|resignation|appointment|appoint)\b/i],
  },
  {
    category: "Contracts / Procurement",
    patterns: [/\b(contract|bid|procurement|purchase order|vendor|consulting|agreement|rfp)\b/i],
  },
  {
    category: "Budget / Finance",
    patterns: [/\b(budget|finance|financial|appropriation|amendment|transfer|salary|compensation|fiscal)\b/i],
  },
  {
    category: "Facilities / Construction",
    patterns: [/\b(facility|facilities|construction|renovation|site survey|building|media center|cafeteria|capital improvement)\b/i],
  },
  {
    category: "Policy / Governance",
    patterns: [/\b(policy|governance|board policy|resolution|bylaw|committee|election|vice president|president)\b/i],
  },
  {
    category: "Curriculum / Instruction",
    patterns: [/\b(curriculum|instruction|instructional|academic|learning|classroom)\b/i],
  },
  {
    category: "Student Services",
    patterns: [/\b(student services?|special education|discipline|attendance|counseling)\b/i],
  },
  {
    category: "Safety / Security",
    patterns: [/\b(safety|security|safety and security|emergency|security system)\b/i],
  },
  {
    category: "Transportation",
    patterns: [/\b(transportation|bus|route|fleet)\b/i],
  },
  {
    category: "Technology",
    patterns: [/\b(technology|software|hardware|network|device|devices|computer|digital)\b/i],
  },
  {
    category: "Legal / Compliance",
    patterns: [/\b(legal|litigation|compliance|act \d{4}-\d+|code of alabama|statute|policy compliance)\b/i],
  },
  {
    category: "Athletics / Extracurricular",
    patterns: [/\b(athletic|athletics|extracurricular|sports|coach|stadium|field trip)\b/i],
  },
  {
    category: "Operations / Administration",
    patterns: [/\b(operations|administration|superintendent|board members' monthly compensation|organizational chart)\b/i],
  },
];

export const categorizeVoteItemText = (input: {
  itemTitle?: string | null | undefined;
  motionText?: string | null | undefined;
  summaryText?: string | null | undefined;
  sourceExcerpt?: string | null | undefined;
}): { category: VoteItemCategory; categoryConfidence: number; matchedText: string | null } => {
  const text = normalizeWhitespace([input.itemTitle, input.motionText, input.summaryText, input.sourceExcerpt].filter(Boolean).join(" "));
  if (!text) {
    return { category: "Needs review", categoryConfidence: 0.1, matchedText: null };
  }

  if (categoryParserArtifactPatterns.some((pattern) => pattern.test(text))) {
    return { category: "Needs review", categoryConfidence: 0.1, matchedText: text };
  }

  const lowerText = text.toLowerCase();
  for (const rule of categoryRules) {
    const matchedPattern = rule.patterns.find((pattern) => pattern.test(lowerText));
    if (matchedPattern) {
      const confidence = lowerText.length < 40 ? 0.76 : 0.9;
      return { category: rule.category, categoryConfidence: confidence, matchedText: text };
    }
  }

  if (/\b(approve|approved|motion|item|matter)\b/i.test(text)) {
    return { category: "Needs review", categoryConfidence: 0.45, matchedText: text };
  }

  return { category: "Needs review", categoryConfidence: 0.2, matchedText: text };
};

export const buildSourceAuditInfo = (sourceUrl?: string | null): SourceAuditInfo => {
  if (sourceUrl && /^https?:\/\//i.test(sourceUrl)) {
    return {
      sourceUrl,
      sourceAvailability: "available",
      sourceLabel: sourceUrl,
    };
  }

  return {
    sourceUrl: sourceUrl ?? null,
    sourceAvailability: "unavailable",
    sourceLabel: "Source unavailable",
  };
};

const noVoteDisplayRejectPatterns = [
  /motion made by/i,
  /motion seconded by/i,
  /\bvoting\s*:/i,
  /unanimously approved/i,
  /all voiced approval/i,
  /declared the motion carries/i,
  /action agenda/i,
  /superintendent recommendations/i,
  /(?:^|\s)(?:mrs|ms|miss|dr)\.?\s+[A-Z]/i,
  /\bmike johnson\b/i,
  /\bmr\.?\s+johnson\b/i,
  /(?:^|\s)[A-Z][a-z]+(?:\s+[A-Z][a-z.]+){0,3}\s*-\s*(?:Yes|No|Abstain|Recused|Absent)\b/,
  /\b(?:Yes|No|Abstain|Recused|Absent):\s*[A-Z]/,
] as const;

const noVoteDisplaySplitPatterns = [
  /motion made by/i,
  /motion seconded by/i,
  /\bvoting\s*:/i,
  /unanimously approved/i,
  /action agenda/i,
  /superintendent recommendations/i,
  /all voiced approval/i,
  /declared the motion carries/i,
  /(?:^|\s)(?:mrs|ms|miss|dr)\.?\s+[A-Z]/i,
  /(?:^|\s)[A-Z][a-z]+(?:\s+[A-Z][a-z.]+){0,3}\s*-\s*(?:Yes|No|Abstain|Recused|Absent)\b/,
  /\b(?:Yes|No|Abstain|Recused|Absent):\s*[A-Z]/,
] as const;

const normalizeNoVoteDisplayText = (value?: string | null) => normalizeWhitespace(value).replace(/\s+([,.;:])/g, "$1").trim();

const trimNoVoteDisplaySuffix = (value: string) =>
  value
    .replace(/[\s,:;\-]+$/g, "")
    .replace(/^[-,:;\s]+/g, "")
    .trim();

const containsRejectedNoVoteDisplayText = (value: string) => noVoteDisplayRejectPatterns.some((pattern) => pattern.test(value));

const getFirstNoVoteDisplaySplitIndex = (value: string) => {
  let firstIndex = -1;

  noVoteDisplaySplitPatterns.forEach((pattern) => {
    const matchIndex = value.search(pattern);
    if (matchIndex < 0) return;
    if (firstIndex === -1 || matchIndex < firstIndex) {
      firstIndex = matchIndex;
    }
  });

  return firstIndex;
};

const isMeaningfulNoVoteDisplayText = (value: string) => {
  if (!value) return false;
  if (value.length < 12) return false;
  if (/^(needs review|approved|approve|adopted|carried|passed|failed)$/i.test(value)) return false;
  return true;
};

export const sanitizePublicVoteDisplayText = (
  rawValue: string | null | undefined,
  mode: "leading-clean-segment" | "strict-outcome" = "leading-clean-segment",
): string => {
  const normalized = normalizeNoVoteDisplayText(rawValue);
  if (!normalized) return "Needs review";

  if (mode === "strict-outcome") {
    return containsRejectedNoVoteDisplayText(normalized) ? "Needs review" : normalized;
  }

  const splitIndex = getFirstNoVoteDisplaySplitIndex(normalized);
  const candidate = trimNoVoteDisplaySuffix(splitIndex >= 0 ? normalized.slice(0, splitIndex) : normalized);
  if (!candidate) return "Needs review";
  if (containsRejectedNoVoteDisplayText(candidate)) return "Needs review";
  if (!isMeaningfulNoVoteDisplayText(candidate)) return "Needs review";
  return candidate;
};

export type MemberNoVoteSourceRecord = {
  voteItemId: number;
  meetingId: number;
  meetingDate: string | null;
  meetingTitle: string | null;
  meetingType: string | null;
  sourceUrl: string | null;
  itemTitle: string | null;
  motionText: string | null;
  summaryText: string | null;
  result: string | null;
  verificationStatus: string | null;
  confidenceScore: number | string | null;
  sourceExcerpt: string | null;
  category?: VoteItemCategory | null;
  categoryConfidence?: number | string | null;
  voteRecords?: Array<{ boardMember?: { name?: string | null } | null; voteValue?: string | null }> | null;
};

export type MemberNoVoteItem = {
  voteItemId: number;
  meetingId: number;
  meetingDate: string;
  meetingTitle: string;
  meetingType: string;
  sourceUrl: string | null;
  sourceAvailability: "available" | "unavailable";
  sourceLabel: string;
  itemTitle: string;
  motionText: string | null;
  summaryText: string | null;
  result: string | null;
  verificationStatus: string;
  confidenceScore: number | string | null;
  sourceExcerpt: string | null;
  category: VoteItemCategory;
  categoryConfidence: number | string | null;
  memberVote: "No";
  overallOutcome: string;
};

export const buildMemberNoVoteItems = (
  memberName: string,
  voteItems: MemberNoVoteSourceRecord[],
): MemberNoVoteItem[] => {
  const canonicalMember = getCanonicalBoardMemberName(memberName);
  if (!canonicalMember) return [];

  return voteItems
    .filter((item) =>
      (item.voteRecords ?? []).some(
        (record) =>
          getCanonicalBoardMemberName(record.boardMember?.name ?? null) === canonicalMember &&
          normalizeVoteValue(record.voteValue ?? "") === "no",
      ),
    )
    .map((item) => {
      const categoryInfo = categorizeVoteItemText(item);
      const sourceInfo = buildSourceAuditInfo(item.sourceUrl);
      return {
        voteItemId: item.voteItemId,
        meetingId: item.meetingId,
        meetingDate: item.meetingDate ?? "",
        meetingTitle: item.meetingTitle ?? "Needs review",
        meetingType: item.meetingType ?? "Needs review",
        sourceUrl: sourceInfo.sourceUrl,
        sourceAvailability: sourceInfo.sourceAvailability,
        sourceLabel: sourceInfo.sourceLabel,
        itemTitle: item.itemTitle ?? "Needs review",
        motionText: sanitizePublicVoteDisplayText(item.motionText),
        summaryText: sanitizePublicVoteDisplayText(item.summaryText),
        result: item.result ?? null,
        verificationStatus: item.verificationStatus ?? "needs_review",
        confidenceScore: item.confidenceScore ?? null,
        sourceExcerpt: sanitizePublicVoteDisplayText(item.sourceExcerpt),
        category: item.category ?? categoryInfo.category,
        categoryConfidence: item.categoryConfidence ?? categoryInfo.categoryConfidence,
        memberVote: "No",
        overallOutcome: sanitizePublicVoteDisplayText(item.result, "strict-outcome"),
      };
    });
};