import type { AgendaItemLoaderResponse } from "../parsers/agendaItemParser";
import type {
  ExtractedVoteTally,
  MinutesVoteExtraction,
} from "../parsers/minutesVoteParser";
import type { ParsedVoteItem, ParsedVoteRecord } from "../parsers/simbliParser";
import { normalizeWhitespace } from "../../utils/text";
import { normalizeVoteValue } from "../../utils/votes";

export type MinutesVoteBucket =
  | "unanimous-with-member-votes"
  | "unanimous-narrative-only"
  | "mixed-narrative"
  | "tally-only"
  | "summary-only";

export type MinutesVoteFailureCode =
  | "multi-motion-item"
  | "ambiguous-result-summary"
  | "missing-motion-text"
  | "conflicting-tally";

export type MinutesVoteSignalCode =
  | MinutesVoteFailureCode
  | "collapsed-voting-html"
  | "narrative-only-outcome";

export type MinutesVoteProofInput = {
  meetingDate: string;
  meetingTitle: string;
  meetingTypeName: string;
  agendaId: string;
  agendaTitle: string | null;
  enSiteId: string;
  sourceType: string;
  requestPath: string;
  requestUrl: string;
  parsedAgendaItem: AgendaItemLoaderResponse;
  extractedVote: MinutesVoteExtraction;
};

export type MinutesVotePatternRuleSet = {
  confidence: string[];
  verification: string[];
};

export type NormalizedMinutesVoteProof = {
  bucket: MinutesVoteBucket;
  confidenceScore: number;
  confidenceLabel: "high" | "medium" | "low";
  verificationStatus: ParsedVoteItem["verificationStatus"];
  persistReady: boolean;
  signalCodes: MinutesVoteSignalCode[];
  confidenceRules: string[];
  verificationRules: string[];
  failureCodes: MinutesVoteFailureCode[];
  warnings: string[];
  derivedTally: Record<string, number>;
  explicitTally: ExtractedVoteTally | null;
  motionTextCandidates: string[];
  voteItem: ParsedVoteItem;
  voteRecords: ParsedVoteRecord[];
};

type DetectionFlags = {
  collapsedVotingHtml: boolean;
  multiMotionItem: boolean;
  narrativeOnlyOutcome: boolean;
  ambiguousResultSummary: boolean;
  missingMotionText: boolean;
  mixedNarrative: boolean;
  unanimousNarrative: boolean;
  conflictingTally: boolean;
};

const unanimousNarrativePattern =
  /\b(unanimous|unanimously|all voiced approval|all approved|all in favor|no opposition|no dissent)\b/i;
const mixedNarrativePattern =
  /\b(except for|except|opposed|opposition|dissent|dissented|abstain(?:ed)?|voted\s+no|voted\s+abstain|nays?)\b/i;
const sentencePattern = /[^.!?]+[.!?]?/g;

export const minutesVotePatternRules: Record<MinutesVoteBucket, MinutesVotePatternRuleSet> = {
  "unanimous-with-member-votes": {
    confidence: [
      "At least one member vote was extracted.",
      "All extracted member votes normalize to `yes`.",
      "No conflicting explicit tally or mixed-outcome narrative is present.",
    ],
    verification: [
      "Mark `verified` when the item has a single motion cycle and no contradictory tally/narrative.",
      "Downgrade to `flagged` when multiple motion cycles collapse into one item boundary.",
    ],
  },
  "unanimous-narrative-only": {
    confidence: [
      "No member votes were extracted.",
      "No explicit tally was extracted.",
      "Minutes or VotingHTML contain strong unanimous language such as `Unanimously Approved` or `All voiced approval`.",
    ],
    verification: [
      "Mark `needs_review` by default because VoteRecord rows cannot be independently verified.",
      "Downgrade to `flagged` when multiple motion cycles are detected in the same agenda item.",
    ],
  },
  "mixed-narrative": {
    confidence: [
      "Either extracted member votes contain more than one vote value, or the minutes explicitly describe dissent/abstention.",
      "Derived tally includes at least one `no` or `abstain`.",
      "No contradictory tally/result text is present.",
    ],
    verification: [
      "Mark `verified` when member votes are extracted and the item has a single motion cycle.",
      "Mark `needs_review` when the mixed outcome is narrative-only without member-level VoteRecord rows.",
      "Downgrade to `flagged` when multiple motion cycles collapse into one item boundary.",
    ],
  },
  "tally-only": {
    confidence: [
      "An explicit numeric tally was extracted.",
      "No member-level vote rows were extracted.",
      "The tally is the best available structured evidence for the outcome.",
    ],
    verification: [
      "Mark `needs_review` because VoteRecord rows cannot be resolved to members.",
      "Downgrade to `flagged` when the tally conflicts with the narrative outcome text.",
    ],
  },
  "summary-only": {
    confidence: [
      "The item exposes vote-bearing summary text but no member votes and no tally.",
      "The best stable output is a VoteItem summary plus a source excerpt.",
    ],
    verification: [
      "Mark `needs_review` by default.",
      "Downgrade to `flagged` when the summary spans multiple motion cycles or cannot be reduced to one outcome.",
    ],
  },
};

const uniq = <T>(values: T[]) => [...new Set(values)];

const last = <T>(values: T[]) => (values.length ? values[values.length - 1] : undefined);

const getSentences = (value: string) =>
  normalizeWhitespace(value)
    .match(sentencePattern)
    ?.map((sentence) => normalizeWhitespace(sentence))
    .filter(Boolean) ?? [];

const stripHtml = (value?: string | null) =>
  normalizeWhitespace((value ?? "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " "));

const collectMotionTextCandidates = (texts: string[]) => {
  const candidates: string[] = [];
  const patterns = [
    /made a motion to\s+(.+?)(?=,\s*seconded by|\.|$)/gi,
    /motion was made(?:\s+from the table)?\s+"([^"]+)"/gi,
    /recommends adoption of a motion\s+"([^"]+)"/gi,
    /motion to\s+(.+?)(?=,\s*seconded by|\.|$)/gi,
  ];

  for (const text of texts) {
    for (const pattern of patterns) {
      for (const match of text.matchAll(pattern)) {
        const candidate = normalizeWhitespace((match[1] ?? "").replace(/^to\s+/i, "").replace(/^"+|"+$/g, ""));
        if (candidate) candidates.push(candidate);
      }
    }
  }

  return uniq(candidates);
};

const tallyVoteRecords = (voteRecords: ParsedVoteRecord[]) => {
  const tally: Record<string, number> = {};
  for (const vote of voteRecords) {
    tally[vote.value] = (tally[vote.value] ?? 0) + 1;
  }
  return tally;
};

const detectMultiMotionItem = (minutesText: string, motionTextCandidates: string[]) => {
  const sentences = getSentences(minutesText);
  const motionSentenceCount = sentences.filter((sentence) =>
    /\b(made a motion|motion was made|moved to)\b/i.test(sentence),
  ).length;
  const voteCallCount = sentences.filter((sentence) =>
    /\bcalled for (?:a )?(?:roll call )?vote\b/i.test(sentence),
  ).length;
  const declaredResultCount = sentences.filter((sentence) =>
    /\bdeclared the motion (?:carried|passes|passed|carries)\b/i.test(sentence),
  ).length;

  return motionTextCandidates.length > 1 || motionSentenceCount > 1 || voteCallCount > 1 || declaredResultCount > 1;
};

const detectCollapsedVotingHtml = (response: AgendaItemLoaderResponse) => {
  const votingHtml = response.Minutes && typeof response.Minutes === "object" && !Array.isArray(response.Minutes)
    ? ((response.Minutes as { VotingHTML?: string[] | null }).VotingHTML ?? [])
    : [];

  return votingHtml.some((line) => (typeof line === "string" ? (line.match(/<li\b/gi) ?? []).length > 1 : false));
};

const deriveBucket = (
  extractedVote: MinutesVoteExtraction,
  flags: Pick<DetectionFlags, "mixedNarrative" | "unanimousNarrative">,
): MinutesVoteBucket => {
  const voteKinds = new Set(
    extractedVote.memberVotes.map((vote: MinutesVoteExtraction["memberVotes"][number]) => vote.vote),
  );

  if (extractedVote.memberVotes.length > 0) {
    return voteKinds.size === 1 && voteKinds.has("yes")
      ? "unanimous-with-member-votes"
      : "mixed-narrative";
  }

  if (extractedVote.tally) return "tally-only";
  if (flags.mixedNarrative) return "mixed-narrative";
  if (flags.unanimousNarrative) return "unanimous-narrative-only";
  return "summary-only";
};

const deriveResultText = (
  extractedVote: MinutesVoteExtraction,
  bucket: MinutesVoteBucket,
) => {
  if (extractedVote.finalResultText) return extractedVote.finalResultText;

  if (bucket === "mixed-narrative" || bucket === "tally-only") {
    return last(extractedVote.voteBearingClues) ?? null;
  }

  if (bucket === "unanimous-with-member-votes" || bucket === "unanimous-narrative-only") {
    return "Unanimously approved";
  }

  return last(extractedVote.voteBearingClues) ?? null;
};

const deriveVerificationStatus = (
  bucket: MinutesVoteBucket,
  flags: DetectionFlags,
  voteRecords: ParsedVoteRecord[],
): ParsedVoteItem["verificationStatus"] => {
  if (flags.multiMotionItem) return "flagged";
  if (bucket === "unanimous-with-member-votes") return "verified";
  if (bucket === "mixed-narrative") return voteRecords.length > 0 ? "verified" : "needs_review";
  if (bucket === "tally-only") return flags.conflictingTally ? "flagged" : "needs_review";
  return "needs_review";
};

const deriveConfidenceScore = (
  bucket: MinutesVoteBucket,
  flags: DetectionFlags,
  voteRecords: ParsedVoteRecord[],
) => {
  let score =
    bucket === "unanimous-with-member-votes"
      ? 0.97
      : bucket === "mixed-narrative"
        ? voteRecords.length > 0
          ? 0.95
          : 0.72
        : bucket === "tally-only"
          ? 0.84
          : bucket === "unanimous-narrative-only"
            ? 0.74
            : 0.56;

  if (flags.collapsedVotingHtml && voteRecords.length === 0) score -= 0.03;
  if (flags.narrativeOnlyOutcome) score -= 0.04;
  if (flags.ambiguousResultSummary) score -= 0.08;
  if (flags.missingMotionText) score -= 0.05;
  if (flags.conflictingTally) score -= 0.12;
  if (flags.multiMotionItem) score -= 0.28;

  return Math.max(0.2, Number(score.toFixed(2)));
};

const deriveConfidenceLabel = (score: number) =>
  score >= 0.9 ? "high" : score >= 0.7 ? "medium" : "low";

const deriveWarnings = (flags: DetectionFlags) => {
  const warnings: string[] = [];
  if (flags.collapsedVotingHtml) {
    warnings.push("VotingHTML arrived as collapsed HTML list markup and had to be expanded before vote parsing.");
  }
  if (flags.narrativeOnlyOutcome) {
    warnings.push("Outcome is narrative-only; VoteRecord rows cannot be verified from member-level data.");
  }
  if (flags.ambiguousResultSummary) {
    warnings.push("Final result summary still contains motion text or multiple clauses.");
  }
  if (flags.missingMotionText) {
    warnings.push("No stable motion text was isolated from the minutes narrative.");
  }
  if (flags.multiMotionItem) {
    warnings.push("Multiple motion cycles appear inside one agenda item, so item boundaries are not stable enough for one VoteItem row.");
  }
  if (flags.conflictingTally) {
    warnings.push("Explicit tally conflicts with derived member-vote counts.");
  }
  return warnings;
};

const deriveFailureCodes = (flags: DetectionFlags) => {
  const failures: MinutesVoteFailureCode[] = [];
  if (flags.multiMotionItem) failures.push("multi-motion-item");
  if (flags.ambiguousResultSummary) failures.push("ambiguous-result-summary");
  if (flags.missingMotionText) failures.push("missing-motion-text");
  if (flags.conflictingTally) failures.push("conflicting-tally");
  return failures;
};

const deriveSignalCodes = (flags: DetectionFlags) => {
  const signalCodes: MinutesVoteSignalCode[] = [];
  if (flags.collapsedVotingHtml) signalCodes.push("collapsed-voting-html");
  if (flags.narrativeOnlyOutcome) signalCodes.push("narrative-only-outcome");
  signalCodes.push(...deriveFailureCodes(flags));
  return signalCodes;
};

export const normalizeMinutesVoteProof = (
  input: MinutesVoteProofInput,
): NormalizedMinutesVoteProof => {
  const sourceTexts = [input.extractedVote.minutesText ?? "", ...input.extractedVote.votingLines].filter(Boolean);
  const motionTextCandidates = collectMotionTextCandidates(sourceTexts);
  const voteRecords = input.extractedVote.memberVotes.map((vote) => ({
    memberName: vote.member,
    value: normalizeVoteValue(vote.vote),
  }));
  const derivedTally = tallyVoteRecords(voteRecords);
  const collapsedVotingHtml = detectCollapsedVotingHtml(input.parsedAgendaItem);
  const multiMotionItem = detectMultiMotionItem(input.extractedVote.minutesText ?? "", motionTextCandidates);
  const narrativeOnlyOutcome =
    input.extractedVote.memberVotes.length === 0 && input.extractedVote.tally === null;
  const mixedNarrative = mixedNarrativePattern.test(
    [input.extractedVote.finalResultText ?? "", ...input.extractedVote.voteBearingClues].join(" "),
  );
  const unanimousNarrative = unanimousNarrativePattern.test(
    [
      input.extractedVote.finalResultText ?? "",
      ...input.extractedVote.voteBearingClues,
      ...input.extractedVote.votingLines,
    ].join(" "),
  );
  const explicitTally = input.extractedVote.tally;
  const conflictingTally = Boolean(
    explicitTally &&
      voteRecords.length > 0 &&
      (explicitTally.yes !== (derivedTally.yes ?? 0) ||
        explicitTally.no !== (derivedTally.no ?? 0) ||
        (explicitTally.abstain ?? 0) !== (derivedTally.abstain ?? 0)),
  );
  const normalizedResultText = normalizeWhitespace(input.extractedVote.finalResultText ?? "");
  const repeatedOutcomeMarkers =
    normalizedResultText.match(
      /\b(all voiced approval|declared the motion|unanimously approved|motion carr(?:ies|ied)|approved|passed|carried)\b/gi,
    ) ?? [];
  const ambiguousResultSummary = Boolean(
    normalizedResultText &&
      (/\b(made a motion|motion was made|motion made by|motion seconded by|seconded by|called for (?:the )?vote)\b/i.test(
        normalizedResultText,
      ) ||
        repeatedOutcomeMarkers.length > 3),
  );
  const missingMotionText = motionTextCandidates.length === 0;

  const flags: DetectionFlags = {
    collapsedVotingHtml,
    multiMotionItem,
    narrativeOnlyOutcome,
    ambiguousResultSummary,
    missingMotionText,
    mixedNarrative,
    unanimousNarrative,
    conflictingTally,
  };

  const bucket = deriveBucket(input.extractedVote, flags);
  const verificationStatus = deriveVerificationStatus(bucket, flags, voteRecords);
  const confidenceScore = deriveConfidenceScore(bucket, flags, voteRecords);
  const confidenceLabel = deriveConfidenceLabel(confidenceScore);
  const resultText = deriveResultText(input.extractedVote, bucket);
  const voteTally =
    voteRecords.length > 0
      ? derivedTally
      : explicitTally
        ? {
            yes: explicitTally.yes,
            no: explicitTally.no,
            ...(explicitTally.abstain !== null ? { abstain: explicitTally.abstain } : {}),
          }
        : {};

  const agendaSection = normalizeWhitespace(input.parsedAgendaItem.itemDetails.Sequence);
  const summaryText =
    resultText ??
    input.extractedVote.summaryText ??
    (input.extractedVote.voteBearingClues.length ? input.extractedVote.voteBearingClues[0] : null);
  const motionText = motionTextCandidates[0] ?? input.extractedVote.motionText ?? null;
  const voteItem: ParsedVoteItem = {
    itemTitle: input.agendaTitle ?? input.parsedAgendaItem.itemDetails.Title,
    isNonUnanimous:
      bucket === "mixed-narrative" || (voteTally.no ?? 0) > 0 || (voteTally.abstain ?? 0) > 0,
    voteTally,
    verificationStatus,
    confidenceScore,
    votes: voteRecords,
    ...(agendaSection ? { agendaSection } : {}),
    ...(summaryText ? { summaryText } : {}),
    ...(input.requestUrl ? { summarySource: input.requestUrl } : {}),
    ...(confidenceScore ? { summaryConfidenceScore: confidenceScore } : {}),
    ...(motionText ? { motionText } : {}),
    ...(input.extractedVote.motionMaker ? { motionMadeBy: input.extractedVote.motionMaker } : {}),
    ...(input.extractedVote.seconder ? { motionSecondedBy: input.extractedVote.seconder } : {}),
    ...(resultText ? { result: resultText } : {}),
    ...(normalizeWhitespace(
      [
        input.extractedVote.minutesText ?? "",
        ...input.extractedVote.votingLines,
      ]
        .filter(Boolean)
        .join(" "),
    ).slice(0, 750)
      ? {
          sourceExcerpt: normalizeWhitespace(
            [
              input.extractedVote.minutesText ?? "",
              ...input.extractedVote.votingLines,
            ]
              .filter(Boolean)
              .join(" "),
          ).slice(0, 750),
        }
      : {}),
    ...(bucket ? { detectedPattern: bucket } : {}),
  };

  return {
    bucket,
    confidenceScore,
    confidenceLabel,
    verificationStatus,
    persistReady: !multiMotionItem && bucket !== "summary-only",
    signalCodes: deriveSignalCodes(flags),
    confidenceRules: minutesVotePatternRules[bucket].confidence,
    verificationRules: minutesVotePatternRules[bucket].verification,
    failureCodes: deriveFailureCodes(flags),
    warnings: deriveWarnings(flags),
    derivedTally,
    explicitTally,
    motionTextCandidates,
    voteItem,
    voteRecords,
  };
};

export const buildMinutesVoteRequestUrl = (requestPath: string) =>
  `https://simbli.eboardsolutions.com${requestPath}`;

export const getMinutesPayloadVotingHtml = (response: AgendaItemLoaderResponse) => {
  if (!response.Minutes || typeof response.Minutes !== "object" || Array.isArray(response.Minutes)) return [];
  return ((response.Minutes as { VotingHTML?: string[] | null }).VotingHTML ?? []).map((line) => stripHtml(line));
};
