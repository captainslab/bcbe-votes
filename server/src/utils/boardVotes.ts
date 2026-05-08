import { sanitizeBoardVotesDisplayText, sanitizeBoardVotesPersonName } from "./nameSanitizer";
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
  | "Contracts & Procurement"
  | "Budget & Finance"
  | "Facilities & Property"
  | "Policy & Governance"
  | "Curriculum & Academics"
  | "Student Services"
  | "Safety & Operations"
  | "Transportation"
  | "Technology"
  | "Legal & Compliance"
  | "Athletics & Extracurricular"
  | "Grants & Federal Programs"
  | "Routine Administration"
  | "Other / Needs Review";

export type SourceAuditInfo = {
  sourceUrl: string | null;
  sourceAvailability: "available" | "unavailable";
  sourceLabel: string;
};

export const getCanonicalBoardMemberName = (rawName?: string | null): CanonicalBoardMemberName | null => {
  const normalized = sanitizeBoardVotesPersonName(rawName);
  if (!normalized) return null;
  if (parserArtifactPatterns.some((pattern) => pattern.test(normalized))) return null;
  const alias = memberAliasMap[normalized.toLowerCase()];
  if (alias) return alias;
  return canonicalBoardMembers.includes(normalized as (typeof canonicalBoardMembers)[number])
    ? (normalized as CanonicalBoardMemberName)
    : null;
};

const publicNameAliasMap: Record<string, string> = {
  "shannon cauley": "Shannon Cauley",
  "mike johnson": "Mike Johnson",
};

export const getNeutralPublicPersonName = (rawName?: string | null): string | null => {
  const canonicalBoardMember = getCanonicalBoardMemberName(rawName);
  if (canonicalBoardMember) return canonicalBoardMember;
  const sanitized = sanitizeBoardVotesPersonName(rawName);
  if (!sanitized) return null;
  if (parserArtifactPatterns.some((pattern) => pattern.test(sanitized))) return null;
  return publicNameAliasMap[sanitized.toLowerCase()] ?? sanitized;
};

const categoryParserArtifactPatterns = [
  /motion made by/i,
  /motion seconded by/i,
  /\bmade a motion\b/i,
  /\bseconded by\b/i,
  /\bvoting\s*:/i,
  /unanimously approved/i,
  /action agenda/i,
  /superintendent recommendations/i,
  /all voiced approval/i,
  /all indicated approval/i,
  /declared the motion carri(?:ed|es)/i,
  /(?:^|\s)[A-Z][a-z]+(?:\s+[A-Z][a-z.]+){0,3}\s*-\s*(?:Yes|No|Abstain|Recused|Absent)\b/,
  /\b(?:Yes|No|Abstain|Recused|Absent):\s*[A-Z]/,
] as const;

const categoryRules: Array<{ category: VoteItemCategory; patterns: RegExp[] }> = [
  {
    // Personnel comes first so "transfer of personnel" beats "budget transfer"
    category: "Personnel",
    patterns: [
      /\b(personnel|hire|hiring|employment|employ|resign(?:ation)?|termination|suspension|transfer of personnel|leaves? of absence|extra work|certificated|classified|appoint(?:ment)?s?|retirement|retire|administrative\s+appointments?|new\s+position)\b/i,
    ],
  },
  {
    category: "Contracts & Procurement",
    patterns: [
      /\b(contracts?|bids?|procurement|purchase|vendor|consulting|agreements?|rfp|proposals?|owner[\s/]+engineer|teams\s+contracts?|engagement|ratification|mou|donation)\b/i,
    ],
  },
  {
    // "amendment" removed — too broad; "budget" alone catches "budget amendment" titles
    category: "Budget & Finance",
    patterns: [
      /\b(budget|finance|financial|appropriation|salary|compensation|fiscal|extra\s+work\s+wages?|stipend|reimbursement|expenditure|tax\s+levy|millage|mill\s+commission|audit|fund\s+balance|contribution)\b/i,
    ],
  },
  {
    category: "Facilities & Property",
    patterns: [
      /\b(facility|facilities|construction|renovation|site\s+survey|building|media\s+center|cafeteria|capital\s+improvement|public\s+works|property|real\s+estate|lease|architect|engineering\s+services|owner[\s/]+engineer|change\s+orders?|deed|easement|drainage|conveyance)\b/i,
    ],
  },
  {
    category: "Policy & Governance",
    patterns: [
      /\b(policy|policies|governance|board\s+policy|resolution|bylaw|committee|election|president|executive\s+session|handbook|code\s+of\s+conduct|articles?\s+of\s+incorporation)\b/i,
    ],
  },
  {
    category: "Curriculum & Academics",
    patterns: [
      /\b(curriculum|instruction|instructional|academic|learning|classroom|textbooks?|course\s+of\s+study|course\s+fee|intervention|screener|assessment|literacy|professional\s+development)\b/i,
    ],
  },
  {
    category: "Student Services",
    patterns: [
      /\b(student\s+services?|special\s+education|discipline|attendance|counseling|iep|mental\s+health|student\s+support|alternative\s+school|juvenile)\b/i,
    ],
  },
  {
    category: "Safety & Operations",
    patterns: [
      /\b(safety|security|emergency|alarm|camera|surveillance|school\s+resource\s+officer|crisis|hazard)\b/i,
    ],
  },
  {
    category: "Transportation",
    patterns: [/\b(transportation|bus|route|fleet|vehicle)\b/i],
  },
  {
    category: "Technology",
    patterns: [
      /\b(technology|software|hardware|network|device|devices|computer|digital|chromebooks?|broadband|fiber|infrastructure|licenses?|subscription)\b/i,
    ],
  },
  {
    category: "Legal & Compliance",
    patterns: [
      /\b(legal|litigation|compliance|act\s+\d{4}-\d+|code\s+of\s+alabama|statute|policy\s+compliance|opioid|settlement|claim|indemnification|liability|releases?|letter\s+of\s+engagement|ratification\s+of\s+engagement|attorn(?:ey|eys))\b/i,
    ],
  },
  {
    category: "Athletics & Extracurricular",
    patterns: [
      /\b(athletic|athletics|extracurricular|sport|coach|stadium|field\s+trip|activity\s+fee|band|choral|chorus|drama|theatre|theater)\b/i,
    ],
  },
  {
    category: "Grants & Federal Programs",
    patterns: [
      /\b(grant|federal\s+program|title\s+[ivxlcdm]+\b|esser|arpa|idea|perkins|essa|federal\s+funds?|memorandum\s+of\s+understanding|economic\s+development|workforce\s+development|lea\s+plan|alabama\s+works)\b/i,
    ],
  },
  {
    category: "Routine Administration",
    patterns: [
      /\b(operations|administration|superintendent|approval\s+of\s+minutes|school\s+calendar|items?\s+of\s+business|work\s+session|dissemination|organizational\s+chart|board\s+members'\s+monthly\s+compensation|amendments?\s+to\s+the\s+agenda|delegations?|board\s+view|aasb|convention|delegate\s+assembly|membership\s+renewal)\b/i,
      // Date-formatted approval-of-minutes items: "February 22, 2024 (Regular)"
      /^(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d+,?\s+\d{4}/i,
    ],
  },
];

export const categorizeVoteItemText = (input: {
  itemTitle?: string | null | undefined;
  motionText?: string | null | undefined;
  summaryText?: string | null | undefined;
  sourceExcerpt?: string | null | undefined;
}): { category: VoteItemCategory; categoryConfidence: number; matchedText: string | null } => {
  // Pass 1: title only, no artifact check.
  // Strip leading agenda numbering (e.g. "1. ", "VIII. ") before matching.
  const rawTitle = normalizeWhitespace(input.itemTitle ?? "");
  const titleText = rawTitle.replace(/^(?:\d+\.|[IVXLCDM]+\.)\s+/i, "").trim();
  if (titleText) {
    const lowerTitle = titleText.toLowerCase();
    for (const rule of categoryRules) {
      if (rule.patterns.some((p) => p.test(lowerTitle))) {
        return { category: rule.category, categoryConfidence: 0.85, matchedText: titleText };
      }
    }
  }

  // Pass 2: title + motion + summary, with artifact check (source_excerpt excluded).
  const cleanText = normalizeWhitespace(
    [input.itemTitle, input.motionText, input.summaryText].filter(Boolean).join(" "),
  );
  if (!cleanText) {
    return { category: "Other / Needs Review", categoryConfidence: 0.1, matchedText: null };
  }

  if (categoryParserArtifactPatterns.some((pattern) => pattern.test(cleanText))) {
    return { category: "Other / Needs Review", categoryConfidence: 0.1, matchedText: cleanText };
  }

  const lowerClean = cleanText.toLowerCase();
  for (const rule of categoryRules) {
    if (rule.patterns.some((p) => p.test(lowerClean))) {
      const confidence = lowerClean.length < 40 ? 0.76 : 0.9;
      return { category: rule.category, categoryConfidence: confidence, matchedText: cleanText };
    }
  }

  if (/\b(approve|approved|motion|item|matter)\b/i.test(cleanText)) {
    return { category: "Other / Needs Review", categoryConfidence: 0.45, matchedText: cleanText };
  }

  return { category: "Other / Needs Review", categoryConfidence: 0.2, matchedText: cleanText };
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
  /\bmade a motion\b/i,
  /\bseconded by\b/i,
  /\bvoting\s*:/i,
  /unanimously approved/i,
  /all voiced approval/i,
  /all indicated approval/i,
  /declared the motion carri(?:ed|es)/i,
  /action agenda/i,
  /superintendent recommendations/i,
  /(?:^|\s)(?:mrs|ms|miss|dr)\.?\s+[A-Z]/i,
  /(?:^|\s)[A-Z][a-z]+(?:\s+[A-Z][a-z.]+){0,3}\s*-\s*(?:Yes|No|Abstain|Recused|Absent)\b/,
  /\b(?:Yes|No|Abstain|Recused|Absent):\s*[A-Z]/,
] as const;

const noVoteDisplaySplitPatterns = [
  /motion made by/i,
  /motion seconded by/i,
  /\bmade a motion\b/i,
  /\bseconded by\b/i,
  /\bvoting\s*:/i,
  /unanimously approved/i,
  /action agenda/i,
  /superintendent recommendations/i,
  /all voiced approval/i,
  /all indicated approval/i,
  /declared the motion carri(?:ed|es)/i,
  /(?:^|\s)(?:mrs|ms|miss|dr)\.?\s+[A-Z]/i,
  /(?:^|\s)[A-Z][a-z]+(?:\s+[A-Z][a-z.]+){0,3}\s*-\s*(?:Yes|No|Abstain|Recused|Absent)\b/,
  /\b(?:Yes|No|Abstain|Recused|Absent):\s*[A-Z]/,
] as const;

const normalizeNoVoteDisplayText = (value?: string | null) =>
  normalizeWhitespace(value)
    .replace(/\s+([,.;:])/g, "$1")
    .trim();

const trimNoVoteDisplaySuffix = (value: string) =>
  value
    .replace(/[\s,:;\-]+$/g, "")
    .replace(/^[-,:;\s]+/g, "")
    .trim();

const trailingStandaloneHonorificNameFragmentPattern =
  /(?:[.!?]["')\]]*\s+)(?:mr|mrs|ms|miss|dr)\.?\s+[A-Z][a-z.'-]+(?:\s+[A-Z][a-z.'-]+)?$/i;

const stripTrailingStandaloneHonorificNameFragment = (value: string) =>
  trimNoVoteDisplaySuffix(value.replace(trailingStandaloneHonorificNameFragmentPattern, "").trim());

const containsRejectedNoVoteDisplayText = (value: string) => noVoteDisplayRejectPatterns.some((pattern) => pattern.test(value));

const hasDanglingHonorificToken = (value: string) => /(?:^|\s)(?:mr|mrs|ms|miss|dr)\.?$/i.test(value);

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
  if (Boolean(getCanonicalBoardMemberName(value))) return false;
  return true;
};

export const sanitizePublicVoteDisplayText = (
  rawValue: string | null | undefined,
  mode: "leading-clean-segment" | "strict-outcome" = "leading-clean-segment",
): string => {
  const normalized = sanitizeBoardVotesDisplayText(normalizeNoVoteDisplayText(rawValue));
  if (!normalized) return "Needs review";

  if (mode === "strict-outcome") {
    return containsRejectedNoVoteDisplayText(normalized) ? "Needs review" : normalized;
  }

  const splitIndex = getFirstNoVoteDisplaySplitIndex(normalized);
  const candidate = trimNoVoteDisplaySuffix(splitIndex >= 0 ? normalized.slice(0, splitIndex) : normalized);
  const shouldStripTrailingStandaloneName =
    splitIndex >= 0 || containsRejectedNoVoteDisplayText(normalized) || hasDanglingHonorificToken(candidate);
  const cleanedCandidate = shouldStripTrailingStandaloneName
    ? stripTrailingStandaloneHonorificNameFragment(candidate)
    : candidate;
  if (!cleanedCandidate) return "Needs review";
  if (hasDanglingHonorificToken(cleanedCandidate)) return "Needs review";
  if (containsRejectedNoVoteDisplayText(cleanedCandidate)) return "Needs review";
  if (!isMeaningfulNoVoteDisplayText(cleanedCandidate)) return "Needs review";
  return cleanedCandidate;
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
  memberVote: "No" | "Abstain";
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
      (item.voteRecords ?? []).some((record) => {
        if (getCanonicalBoardMemberName(record.boardMember?.name ?? null) !== canonicalMember) return false;
        const v = normalizeVoteValue(record.voteValue ?? "");
        return v === "no" || v === "abstain";
      }),
    )
    .map((item) => {
      const categoryInfo = categorizeVoteItemText(item);
      const sourceInfo = buildSourceAuditInfo(item.sourceUrl);
      const memberRecord = (item.voteRecords ?? []).find(
        (record) => getCanonicalBoardMemberName(record.boardMember?.name ?? null) === canonicalMember,
      );
      const memberVote = normalizeVoteValue(memberRecord?.voteValue ?? "") === "abstain" ? "Abstain" : "No";
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
        result: sanitizePublicVoteDisplayText(item.result, "strict-outcome"),
        verificationStatus: item.verificationStatus ?? "needs_review",
        confidenceScore: item.confidenceScore ?? null,
        sourceExcerpt: sanitizePublicVoteDisplayText(item.sourceExcerpt),
        category: item.category ?? categoryInfo.category,
        categoryConfidence: item.categoryConfidence ?? categoryInfo.categoryConfidence,
        memberVote,
        overallOutcome: sanitizePublicVoteDisplayText(item.result, "strict-outcome"),
      };
    });
};