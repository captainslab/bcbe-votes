import type { AgendaItemLoaderResponse } from "./agendaItemParser";
import { normalizeWhitespace } from "../../utils/text";
import { normalizeVoteValue } from "../../utils/votes";

export type MinutesVoteShape =
  | "unanimous"
  | "mixed"
  | "tally-only"
  | "summary-only"
  | "none";

export type ExtractedVoteValue = "yes" | "no" | "abstain";
export type MinutesVerificationStatus = "unverified" | "needs_review" | "verified" | "flagged";
export type MemberVoteSource = "minutes-text" | "voting-html";

export type ExtractedMemberVote = {
  member: string;
  vote: ExtractedVoteValue;
  source: MemberVoteSource;
  evidence: string;
};

export type ExtractedVoteTally = {
  yes: number;
  no: number;
  abstain: number | null;
  rawText: string;
};

export type MinutesVoteExtraction = {
  minutesFieldNames: string[];
  minutesText: string | null;
  votingLines: string[];
  summaryText: string | null;
  motionText: string | null;
  motionMaker: string | null;
  seconder: string | null;
  finalResultText: string | null;
  voteBearingClues: string[];
  voteShape: MinutesVoteShape;
  tally: ExtractedVoteTally | null;
  memberVotes: ExtractedMemberVote[];
  detectedPattern: string;
  confidenceScore: number;
  verificationStatus: MinutesVerificationStatus;
  sourceExcerpt: string | null;
  failureReasons: string[];
};

type MinutesPayload = {
  EncrId?: string | null;
  Title?: string | null;
  Minutes?: string | null;
  VotingHTML?: string[] | null;
  [key: string]: unknown;
};

type CandidateMemberVote = ExtractedMemberVote & {
  explicitFullName: boolean;
};

const entityMap: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&rsquo;": "'",
  "&lsquo;": "'",
  "&rdquo;": '"',
  "&ldquo;": '"',
  "&ndash;": "-",
  "&mdash;": "-",
};

const decodeHtmlEntities = (value?: string | null) =>
  Object.entries(entityMap).reduce(
    (output, [entity, replacement]) => output.replaceAll(entity, replacement),
    value ?? "",
  );

const stripHtml = (value?: string | null) =>
  normalizeWhitespace(decodeHtmlEntities(value).replace(/<[^>]+>/g, " "));

const sentencePattern = /[^.!?]+[.!?]?/g;
const titledPersonPattern =
  /(?:Mr|Mrs|Ms|Dr)\.\s+[A-Z][A-Za-z'-]+(?:\s+[A-Z][A-Za-z'-]+)?/;
const bareNamePattern = /[A-Z][A-Za-z'-]+(?:\s+[A-Z][A-Za-z'-]+)+/;
const personPattern = new RegExp(
  `(?:${titledPersonPattern.source}|${bareNamePattern.source})`,
  "g",
);
const personListPattern = `(?:${titledPersonPattern.source}|${bareNamePattern.source})(?:\\s*(?:,|and)\\s*(?:${titledPersonPattern.source}|${bareNamePattern.source}))*`;
const voteCluePattern =
  /\b(vote|voting|motion|second(?:ed|ing)?|approval|approved|denied|failed|passed|carried|unanimous|yes|no|nay|aye|abstain)\b/i;
const resultPattern =
  /\b(approved|approval|denied|failed|passed|carried|adopted|motion carr(?:ies|ied)|declared the motion|unanimous)\b/i;
const unanimousPattern =
  /\b(unanimous|unanimously|all voiced approval|all in favor|all approved|no opposition|no dissent)\b/i;
const motionSentencePattern =
  /\b(made a motion|motion made by|moved to|motion to|recommended to|recommendation to|approve|adopt|increase|decrease|accept)\b/i;
const multiMotionPattern =
  /\b(made a motion|motion made by:|called for (?:the )?vote|declared the motion (?:carried|carries|passed)|unanimously approved)\b/gi;

const uniq = <T>(values: T[]) => [...new Set(values)];

const roundScore = (value: number) => Math.round(value * 100) / 100;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const protectHonorifics = (value: string) =>
  value.replace(/\b(Mr|Mrs|Ms|Dr)\./g, "$1__DOT__");

const restoreHonorifics = (value: string) => value.replace(/__DOT__/g, ".");

const asMinutesPayload = (value: unknown): MinutesPayload | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as MinutesPayload;
};

const extractPerson = (value: string) => {
  const match = value.match(titledPersonPattern);
  return match ? normalizeWhitespace(match[0]) : null;
};

const getSentences = (value: string) =>
  protectHonorifics(value)
    .match(sentencePattern)
    ?.map((sentence) => normalizeWhitespace(restoreHonorifics(sentence)))
    .filter(Boolean) ?? [];

const normalizeMemberName = (value: string) =>
  normalizeWhitespace(value.replace(/^[("'[\s]+/, "").replace(/[)"'\].,:;\s]+$/g, ""));

const getNameTokens = (value: string) =>
  normalizeMemberName(value)
    .replace(/^(Mr|Mrs|Ms|Dr)\.\s+/i, "")
    .split(/\s+/)
    .filter(Boolean);

const getSurname = (value: string) => {
  const tokens = getNameTokens(value);
  return (tokens.length ? tokens[tokens.length - 1] : "")?.toLowerCase() ?? "";
};

const isExplicitFullName = (value: string) => {
  const tokens = getNameTokens(value);
  return tokens.length >= 2;
};

const extractPersonNames = (value: string) => {
  const matches = value.match(personPattern) ?? [];
  return uniq(matches.map((match) => normalizeMemberName(match)));
};

const extractMotionRole = (
  candidates: string[],
  pattern: RegExp,
  fallbackPattern: RegExp,
) => {
  for (const candidate of candidates) {
    const direct = candidate.match(pattern);
    if (direct?.[1]) return normalizeWhitespace(direct[1]);
  }

  for (const candidate of candidates) {
    const fallback = candidate.match(fallbackPattern);
    if (fallback?.[1]) return normalizeWhitespace(fallback[1]);
  }

  return null;
};

const extractMotionText = (minutesText: string, itemTitle: string) => {
  const protectedMinutesText = protectHonorifics(minutesText);
  const candidates = [
    /motion was made(?:\s+from the table)?\s+"([^"]+)"/i,
    /(?:made a motion|moved)\s+to\s+(.+?)(?:(?:,\s*seconded by)|[.;]|$)/i,
    /motion(?:\s+was)?\s+to\s+(.+?)(?:(?:,\s*seconded by)|[.;]|$)/i,
    /recommendation\s+to\s+(.+?)(?:[.;]|$)/i,
    /placed on the agenda to\s+(.+?)(?:[.;]|$)/i,
  ];

  for (const pattern of candidates) {
    const match = protectedMinutesText.match(pattern);
    if (!match?.[1]) continue;
    return normalizeWhitespace(restoreHonorifics(match[1]));
  }

  const firstMotionSentence = getSentences(minutesText).find((sentence) =>
    motionSentencePattern.test(sentence),
  );
  if (firstMotionSentence) return firstMotionSentence;

  return normalizeWhitespace(itemTitle) || null;
};

const extractTally = (text: string): ExtractedVoteTally | null => {
  const labelTally = text.match(
    /\b(?:ayes?|yes)\s*[:\-]?\s*(\d+)\b[\s,;/-]*\b(?:nays?|no)\s*[:\-]?\s*(\d+)\b(?:[\s,;/-]*\babstain(?:ed)?\s*[:\-]?\s*(\d+)\b)?/i,
  );
  if (labelTally) {
    return {
      yes: Number(labelTally[1]),
      no: Number(labelTally[2]),
      abstain: labelTally[3] ? Number(labelTally[3]) : null,
      rawText: normalizeWhitespace(labelTally[0]),
    };
  }

  const voteScore = text.match(
    /\b(?:approved|passed|carried|adopted|failed|denied|vote(?:d)?(?:\s+was)?)\b[^0-9]{0,24}(\d+)\s*(?:-|–|to)\s*(\d+)(?:\s*(?:-|–|to)\s*(\d+))?/i,
  );
  if (voteScore) {
    return {
      yes: Number(voteScore[1]),
      no: Number(voteScore[2]),
      abstain: voteScore[3] ? Number(voteScore[3]) : null,
      rawText: normalizeWhitespace(voteScore[0]),
    };
  }

  return null;
};

const splitNameList = (value: string) =>
  value
    .split(/,| and /i)
    .map((part) => normalizeMemberName(part))
    .filter(Boolean);

const toVoteValue = (value: string) => {
  const normalized = normalizeVoteValue(value);
  if (normalized === "yes" || normalized === "no" || normalized === "abstain") {
    return normalized;
  }
  return "abstain";
};

const pushMemberVotes = (
  votes: CandidateMemberVote[],
  members: string[],
  vote: ExtractedVoteValue,
  source: MemberVoteSource,
  evidence: string,
) => {
  members.forEach((member) => {
    votes.push({
      member,
      vote,
      source,
      evidence,
      explicitFullName: isExplicitFullName(member),
    });
  });
};

const extractMemberVotesFromText = (
  text: string,
  source: MemberVoteSource,
): CandidateMemberVote[] => {
  const votes: CandidateMemberVote[] = [];
  const explicitVotePatterns = [
    new RegExp(
      `(${titledPersonPattern.source}|${bareNamePattern.source})\\s+voted\\s+"?(yes|no|abstain(?:ed)?)"?`,
      "gi",
    ),
    new RegExp(
      `(${titledPersonPattern.source}|${bareNamePattern.source})\\s*[-:]\\s*(yes|no|abstain(?:ed)?)\\b`,
      "gi",
    ),
  ];

  explicitVotePatterns.forEach((pattern) => {
    for (const match of text.matchAll(pattern)) {
      const member = normalizeMemberName(match[1] ?? "");
      const vote = match[2] ? toVoteValue(match[2]) : null;
      if (!member || !vote) continue;
      votes.push({
        member,
        vote,
        source,
        evidence: normalizeWhitespace(match[0]),
        explicitFullName: isExplicitFullName(member),
      });
    }
  });

  const groupedVotePatterns: Array<{ vote: ExtractedVoteValue; pattern: RegExp }> = [
    { vote: "yes", pattern: /\b(?:ayes?|yes)\s*[:\-]\s*([^.;]+)/gi },
    { vote: "no", pattern: /\b(?:nays?|no)\s*[:\-]\s*([^.;]+)/gi },
    { vote: "abstain", pattern: /\babstain(?:ed)?\s*[:\-]\s*([^.;]+)/gi },
    {
      vote: "yes",
      pattern: new RegExp(`(${personListPattern})\\s*,?\\s*who voted\\s+"?yes"?`, "gi"),
    },
    {
      vote: "no",
      pattern: new RegExp(`(${personListPattern})\\s*,?\\s*who voted\\s+"?no"?`, "gi"),
    },
    {
      vote: "abstain",
      pattern: new RegExp(`(${personListPattern})\\s*,?\\s*who abstain(?:ed|s)`, "gi"),
    },
  ];

  groupedVotePatterns.forEach(({ vote, pattern }) => {
    for (const match of text.matchAll(pattern)) {
      const rawMembers = match[1];
      if (!rawMembers) continue;
      const members = rawMembers.match(personPattern)
        ? extractPersonNames(rawMembers)
        : splitNameList(rawMembers);
      if (!members.length) continue;
      pushMemberVotes(votes, members, vote, source, normalizeWhitespace(match[0]));
    }
  });

  return votes;
};

const mergeMemberVotes = (votes: CandidateMemberVote[]) => {
  const failures: string[] = [];
  const explicitVotes = votes.filter((vote) => vote.source === "voting-html" && vote.explicitFullName);

  const promotedVotes = votes.map((vote) => {
    if (vote.source === "voting-html" || vote.explicitFullName) return vote;

    const surname = getSurname(vote.member);
    if (!surname) return vote;

    const matches = explicitVotes.filter(
      (candidate) => candidate.vote === vote.vote && getSurname(candidate.member) === surname,
    );
    const matchedVote = matches.length === 1 ? matches[0] : null;
    if (matchedVote) {
      return {
        ...vote,
        member: matchedVote.member,
        explicitFullName: true,
      };
    }

    return vote;
  });

  const grouped = new Map<string, CandidateMemberVote[]>();
  promotedVotes.forEach((vote) => {
    const key = normalizeMemberName(vote.member).toLowerCase();
    grouped.set(key, [...(grouped.get(key) ?? []), vote]);
  });

  const resolvedVotes: ExtractedMemberVote[] = [];
  grouped.forEach((group, key) => {
    const voteKinds = uniq(group.map((vote) => vote.vote));
    const preferred = [...group].sort((left, right) => {
      const sourceScore = left.source === "voting-html" ? 1 : 0;
      const otherSourceScore = right.source === "voting-html" ? 1 : 0;
      if (sourceScore !== otherSourceScore) return otherSourceScore - sourceScore;
      return right.member.length - left.member.length;
    })[0];
    if (!preferred) return;

    if (voteKinds.length > 1) {
      failures.push(
        `Conflicting vote values remained for ${preferred.member}: ${voteKinds.join(", ")}`,
      );
    }

    resolvedVotes.push({
      member: normalizeMemberName(preferred.member),
      vote: preferred.vote,
      source: preferred.source,
      evidence: preferred.evidence,
    });

    if (!preferred.explicitFullName && preferred.source === "minutes-text") {
      failures.push(`Narrative-only member name remains partial for ${preferred.member}`);
    }

    grouped.delete(key);
  });

  return {
    memberVotes: resolvedVotes.sort((left, right) => left.member.localeCompare(right.member)),
    failureReasons: uniq(failures),
  };
};

const collectClueSentences = (sentences: string[], votingLines: string[]) => {
  const clueSentences = sentences.filter((sentence) => voteCluePattern.test(sentence));

  if (clueSentences.length === 0) {
    return uniq(votingLines.filter((line) => voteCluePattern.test(line)));
  }

  return uniq([...clueSentences, ...votingLines.filter((line) => voteCluePattern.test(line))]);
};

const buildFinalResultText = (
  sentences: string[],
  votingLines: string[],
  clueSentences: string[],
  tally: ExtractedVoteTally | null,
) => {
  const resultSentences = uniq(
    sentences.filter(
      (line) =>
        resultPattern.test(line) &&
        !/\b(motion made by|motion seconded by)\b/i.test(line),
    ),
  );
  if (resultSentences.length > 0) {
    return normalizeWhitespace(resultSentences.join(" "));
  }

  const resultVotingLines = uniq(
    votingLines.filter(
      (line) =>
        resultPattern.test(line) &&
        !/\b(motion made by|motion seconded by)\b/i.test(line),
    ),
  );
  if (resultVotingLines.length > 0) {
    return normalizeWhitespace(resultVotingLines.join(" "));
  }

  const resultClues = clueSentences.filter((sentence) => resultPattern.test(sentence));
  if (resultClues.length > 0) {
    return normalizeWhitespace(resultClues.join(" "));
  }

  if (tally?.rawText) return tally.rawText;
  return clueSentences.length > 0 ? normalizeWhitespace(clueSentences[clueSentences.length - 1]) : null;
};

const toVotingLines = (value: string | null | undefined) => {
  const rawValue = value ?? "";
  const listItems = [...rawValue.matchAll(/<li[^>]*>(.*?)<\/li>/gi)]
    .map((match) => stripHtml(match[1]))
    .filter(Boolean);
  if (listItems.length > 0) return listItems;
  const stripped = stripHtml(rawValue);
  return stripped ? [stripped] : [];
};

const buildSourceExcerpt = (minutesText: string, votingLines: string[]) => {
  const excerptSource = [minutesText, ...votingLines].filter(Boolean).join(" ");
  if (!excerptSource) return null;
  return excerptSource.length > 750 ? `${excerptSource.slice(0, 747)}...` : excerptSource;
};

const detectMultiMotionItem = (minutesText: string, votingLines: string[]) => {
  const combinedText = [minutesText, ...votingLines].filter(Boolean).join(" ");
  const matches = combinedText.match(multiMotionPattern) ?? [];
  const voteCallCount = (combinedText.match(/\bcalled for (?:the )?vote\b/gi) ?? []).length;
  const resultCount =
    (combinedText.match(/\bdeclared the motion (?:carried|carries|passed)\b/gi) ?? []).length +
    (combinedText.match(/\bunanimously approved\b/gi) ?? []).length;

  return matches.length >= 5 && voteCallCount >= 2 && resultCount >= 2;
};

const deriveVoteShape = (
  combinedText: string,
  memberVotes: ExtractedMemberVote[],
  tally: ExtractedVoteTally | null,
  voteBearingClues: string[],
  finalResultText: string | null,
) => {
  const explicitNonYesVote = memberVotes.some((vote) => vote.vote !== "yes");
  if (memberVotes.length > 0) {
    return explicitNonYesVote ? "mixed" : "unanimous";
  }
  if (tally) {
    return tally.no === 0 && (tally.abstain ?? 0) === 0 ? "unanimous" : "tally-only";
  }
  if (unanimousPattern.test(combinedText)) {
    return "unanimous";
  }
  if (finalResultText || voteBearingClues.length > 0) {
    return "summary-only";
  }
  return "none";
};

const derivePattern = (
  voteShape: MinutesVoteShape,
  memberVotes: ExtractedMemberVote[],
  tally: ExtractedVoteTally | null,
) => {
  if (memberVotes.length > 0) {
    return voteShape === "unanimous"
      ? "minutes_rollcall_unanimous"
      : "minutes_rollcall_mixed";
  }
  if (tally) return "minutes_tally_only";
  if (voteShape === "unanimous") return "minutes_summary_unanimous";
  if (voteShape === "summary-only") return "minutes_summary_only";
  return "minutes_no_vote_evidence";
};

const deriveVerificationStatus = (
  memberVotes: ExtractedMemberVote[],
  tally: ExtractedVoteTally | null,
  failureReasons: string[],
  combinedText: string,
) => {
  const hasExplicitVotingHtmlVotes = memberVotes.some((vote) => vote.source === "voting-html");
  const hasNonYesVote = memberVotes.some((vote) => vote.vote !== "yes");
  const hasConflict = failureReasons.some((reason) =>
    /\b(conflicting|partial|multiple motion cycles)\b/i.test(reason),
  );

  if (hasConflict) return "needs_review";
  if (hasExplicitVotingHtmlVotes && (hasNonYesVote || tally || memberVotes.length >= 4)) {
    return "verified";
  }
  if (memberVotes.length > 0 || tally || unanimousPattern.test(combinedText)) {
    return "needs_review";
  }
  return "unverified";
};

const deriveConfidenceScore = (
  memberVotes: ExtractedMemberVote[],
  tally: ExtractedVoteTally | null,
  verificationStatus: MinutesVerificationStatus,
  failureReasons: string[],
  voteBearingClues: string[],
) => {
  let score = 0.35;
  if (voteBearingClues.length > 0) score += 0.15;
  if (tally) score += 0.2;
  if (memberVotes.length > 0) score += 0.3;
  if (memberVotes.some((vote) => vote.source === "voting-html")) score += 0.15;
  if (verificationStatus === "verified") score += 0.05;
  if (verificationStatus === "needs_review") score -= 0.05;
  score -= failureReasons.length * 0.1;
  return roundScore(clamp(score, 0.1, 0.99));
};

export const extractMinutesVoteSummary = (
  response: AgendaItemLoaderResponse,
): MinutesVoteExtraction => {
  const minutesPayload = asMinutesPayload(response.Minutes);
  const minutesText = stripHtml(minutesPayload?.Minutes);
  const votingLines = uniq(
    (minutesPayload?.VotingHTML ?? []).flatMap((line) => toVotingLines(line ?? undefined)),
  );
  const sentences = getSentences(minutesText);
  const sourceTexts = [minutesText, ...votingLines].filter(Boolean);
  const motionMaker = extractMotionRole(
    sourceTexts,
    /motion made by:\s*(.+)$/i,
    new RegExp(`(${titledPersonPattern.source}|${bareNamePattern.source})\\s+made a motion`, "i"),
  );
  const seconder = extractMotionRole(
    sourceTexts,
    /motion seconded by:\s*(.+)$/i,
    new RegExp(`seconded by\\s+(${titledPersonPattern.source}|${bareNamePattern.source})(?=[,.;]|$)`, "i"),
  );
  const voteBearingClues = collectClueSentences(sentences, votingLines);
  const combinedText = [minutesText, ...votingLines].join(" ");
  const tally = extractTally(combinedText);
  const extractedVotes = [
    ...extractMemberVotesFromText(minutesText, "minutes-text"),
    ...votingLines.flatMap((line) => extractMemberVotesFromText(line, "voting-html")),
  ];
  const { memberVotes, failureReasons: voteFailures } = mergeMemberVotes(extractedVotes);
  const finalResultText = buildFinalResultText(sentences, votingLines, voteBearingClues, tally);
  const summaryText = sentences[0] ?? normalizeWhitespace(response.itemDetails.Title) ?? null;
  const motionText = extractMotionText(minutesText, response.itemDetails.Title);
  const voteShape = deriveVoteShape(
    combinedText,
    memberVotes,
    tally,
    voteBearingClues,
    finalResultText,
  );
  const autoFailures = [
    ...voteFailures,
    ...(!minutesText && votingLines.length === 0 ? ["Minutes payload did not contain readable minutes text or voting HTML"] : []),
    ...(voteShape === "summary-only" ? ["Only summary-level vote evidence was available; no roll call or tally found"] : []),
    ...(memberVotes.length === 0 && !tally && voteShape === "unanimous"
      ? ["Unanimous classification depends on narrative language without a roll call or tally"]
      : []),
    ...(detectMultiMotionItem(minutesText, votingLines)
      ? ["Multiple motion cycles appear in one agenda item, so separate votes may still be collapsed"]
      : []),
  ];
  const verificationStatus = deriveVerificationStatus(
    memberVotes,
    tally,
    autoFailures,
    combinedText,
  );
  const confidenceScore = deriveConfidenceScore(
    memberVotes,
    tally,
    verificationStatus,
    autoFailures,
    voteBearingClues,
  );

  return {
    minutesFieldNames: minutesPayload ? Object.keys(minutesPayload) : [],
    minutesText: minutesText || null,
    votingLines,
    summaryText,
    motionText,
    motionMaker: motionMaker ?? extractPerson(minutesText),
    seconder,
    finalResultText,
    voteBearingClues,
    voteShape,
    tally,
    memberVotes,
    detectedPattern: derivePattern(voteShape, memberVotes, tally),
    confidenceScore,
    verificationStatus,
    sourceExcerpt: buildSourceExcerpt(minutesText, votingLines),
    failureReasons: uniq(autoFailures),
  };
};
