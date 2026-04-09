import type { AgendaItemLoaderResponse } from "./agendaItemParser";
import { normalizeWhitespace } from "../../utils/text";

export type MinutesVoteShape =
  | "unanimous"
  | "mixed"
  | "tally-only"
  | "summary-only"
  | "none";

export type ExtractedMemberVote = {
  member: string;
  vote: "yes" | "no" | "abstain";
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
  motionMaker: string | null;
  seconder: string | null;
  finalResultText: string | null;
  voteBearingClues: string[];
  voteShape: MinutesVoteShape;
  tally: ExtractedVoteTally | null;
  memberVotes: ExtractedMemberVote[];
};

type MinutesPayload = {
  EncrId?: string | null;
  Title?: string | null;
  Minutes?: string | null;
  VotingHTML?: string[] | null;
  [key: string]: unknown;
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
const voteCluePattern =
  /\b(vote|voting|motion|second(?:ed|ing)?|approval|approved|denied|failed|passed|carried|unanimous|yes|no|nay|aye|abstain)\b/i;
const unanimousPattern =
  /\b(unanimous|unanimously|all voiced approval|all in favor|all approved|no opposition|no dissent)\b/i;

const uniq = <T>(values: T[]) => [...new Set(values)];

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

const extractTally = (text: string): ExtractedVoteTally | null => {
  const ayesNays = text.match(
    /\bayes?\s*[:\-]?\s*(\d+)\b[\s,;/-]*\bnays?\s*[:\-]?\s*(\d+)\b(?:[\s,;/-]*\babstain(?:ed)?\s*[:\-]?\s*(\d+)\b)?/i,
  );
  if (ayesNays) {
    return {
      yes: Number(ayesNays[1]),
      no: Number(ayesNays[2]),
      abstain: ayesNays[3] ? Number(ayesNays[3]) : null,
      rawText: normalizeWhitespace(ayesNays[0]),
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
    .map((part) => normalizeWhitespace(part))
    .filter(Boolean);

const extractMemberVotes = (texts: string[]): ExtractedMemberVote[] => {
  const matches: ExtractedMemberVote[] = [];

  for (const text of texts) {
    const voteStatements = [
      ...text.matchAll(
        new RegExp(`(${titledPersonPattern.source}|${bareNamePattern.source})\\s+voted\\s+(yes|no|abstain)`, "gi"),
      ),
      ...text.matchAll(new RegExp(`(${bareNamePattern.source})\\s*-\\s*(yes|no|abstain)`, "gi")),
    ];

    for (const match of voteStatements) {
      if (!match[2]) continue;
      matches.push({
        member: normalizeWhitespace(match[1]),
        vote: match[2].toLowerCase() as ExtractedMemberVote["vote"],
      });
    }

    const groupedVotes: Array<{ vote: ExtractedMemberVote["vote"]; pattern: RegExp }> = [
      { vote: "yes", pattern: /\bayes?\s*[:\-]\s*([^.;]+)/i },
      { vote: "no", pattern: /\bnays?\s*[:\-]\s*([^.;]+)/i },
      { vote: "abstain", pattern: /\babstain(?:ed)?\s*[:\-]\s*([^.;]+)/i },
    ];

    for (const groupedVote of groupedVotes) {
      const match = text.match(groupedVote.pattern);
      if (!match?.[1]) continue;
      for (const member of splitNameList(match[1])) {
        matches.push({ member, vote: groupedVote.vote });
      }
    }
  }

  return uniq(matches.map((vote) => JSON.stringify(vote))).map((value) => JSON.parse(value));
};

const collectClueSentences = (minutesText: string, votingLines: string[]) => {
  const sentences =
    protectHonorifics(minutesText)
      .match(sentencePattern)
      ?.map((value) => normalizeWhitespace(restoreHonorifics(value))) ?? [];
  const clueSentences = sentences.filter((sentence) => voteCluePattern.test(sentence));

  if (clueSentences.length === 0) {
    return uniq(votingLines.filter((line) => voteCluePattern.test(line)));
  }

  return uniq([...clueSentences, ...votingLines.filter((line) => voteCluePattern.test(line))]);
};

const buildFinalResultText = (minutesText: string, clueSentences: string[]) => {
  if (!minutesText) return null;

  const protectedText = protectHonorifics(minutesText);
  const voteCallMatch = protectedText.match(
    /[^.?!]*called for the vote[^.?!]*[.?!]?\s*[^.?!]*(?:approval|approved|failed|denied|carried|passed|adopted)[^.?!]*[.?!]?(?:\s*[^.?!]*(?:is|was)\s+[^.?!]+[.?!]?)?/i,
  );
  if (voteCallMatch?.[0]) {
    return normalizeWhitespace(restoreHonorifics(voteCallMatch[0]));
  }

  if (clueSentences.length > 0) {
    return normalizeWhitespace(clueSentences.join(" "));
  }

  return null;
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

export const extractMinutesVoteSummary = (
  response: AgendaItemLoaderResponse,
): MinutesVoteExtraction => {
  const minutesPayload = asMinutesPayload(response.Minutes);
  const minutesText = stripHtml(minutesPayload?.Minutes);
  const votingLines = uniq((minutesPayload?.VotingHTML ?? []).flatMap((line) => toVotingLines(line ?? undefined)));
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
  const voteBearingClues = collectClueSentences(minutesText, votingLines);
  const finalResultText = buildFinalResultText(minutesText, voteBearingClues);
  const tally = extractTally([minutesText, ...votingLines].join(" "));
  const memberVotes = extractMemberVotes([minutesText, ...votingLines]);
  const memberVoteKinds = new Set(memberVotes.map((vote) => vote.vote));

  let voteShape: MinutesVoteShape = "none";
  if (unanimousPattern.test([minutesText, ...votingLines].join(" "))) {
    voteShape = "unanimous";
  } else if (memberVotes.length > 0 && memberVoteKinds.size === 1 && memberVoteKinds.has("yes")) {
    voteShape = "unanimous";
  } else if (memberVotes.length > 0) {
    voteShape = "mixed";
  } else if (tally) {
    voteShape = tally.no === 0 && (tally.abstain ?? 0) === 0 ? "unanimous" : "tally-only";
  } else if (finalResultText || voteBearingClues.length > 0) {
    voteShape = "summary-only";
  }

  return {
    minutesFieldNames: minutesPayload ? Object.keys(minutesPayload) : [],
    minutesText: minutesText || null,
    votingLines,
    motionMaker: motionMaker ?? extractPerson(minutesText),
    seconder,
    finalResultText,
    voteBearingClues,
    voteShape,
    tally,
    memberVotes,
  };
};
