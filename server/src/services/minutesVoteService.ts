import type { AgendaItemLoaderResponse } from "../ingestion/parsers/agendaItemParser";
import {
  extractMinutesVoteSummary,
  type ExtractedVoteValue,
  type MinutesVoteExtraction,
  type MinutesVoteShape,
  type MinutesVerificationStatus,
} from "../ingestion/parsers/minutesVoteParser";
import { categorizeVoteItemText } from "../utils/boardVotes";

export type PersistedMinutesVoteItem = {
  agendaSection: string | null;
  itemTitle: string;
  summaryText: string | null;
  summarySource: string;
  summaryConfidenceScore: number;
  motionText: string | null;
  motionMadeBy: string | null;
  motionSecondedBy: string | null;
  result: string | null;
  voteShape: MinutesVoteShape;
  isNonUnanimous: boolean;
  voteTally: Record<ExtractedVoteValue, number>;
  sourceExcerpt: string | null;
  verificationStatus: MinutesVerificationStatus;
  detectedPattern: string;
  confidenceScore: number;
  category: ReturnType<typeof categorizeVoteItemText>["category"];
  categoryConfidence: number;
};

export type PersistedMinutesVoteRecord = {
  memberName: string;
  voteValue: ExtractedVoteValue;
  source: "minutes-text" | "voting-html";
  evidence: string;
};

export type PersistedMinutesVoteOutput = {
  meetingId: number;
  meetingTitle: string | null;
  meetingDateText: string | null;
  agendaItemId: string;
  agendaParentId: string;
  itemTitle: string;
  rawSourceEvidence: {
    minutesText: string | null;
    votingLines: string[];
    tallyText: string | null;
  };
  voteItem: PersistedMinutesVoteItem;
  voteRecords: PersistedMinutesVoteRecord[];
  extraction: MinutesVoteExtraction;
  failureReasons: string[];
};

const buildVoteTally = (extraction: MinutesVoteExtraction) => {
  const tally: Record<ExtractedVoteValue, number> = {
    yes: 0,
    no: 0,
    abstain: 0,
  };

  extraction.memberVotes.forEach((vote) => {
    tally[vote.vote] += 1;
  });

  if (extraction.memberVotes.length === 0 && extraction.tally) {
    tally.yes = extraction.tally.yes;
    tally.no = extraction.tally.no;
    tally.abstain = extraction.tally.abstain ?? 0;
  }

  return tally;
};

export const buildPersistedMinutesVoteOutput = (
  response: AgendaItemLoaderResponse,
): PersistedMinutesVoteOutput => {
  const extraction = extractMinutesVoteSummary(response);
  const voteTally = buildVoteTally(extraction);
  const itemTitle = response.itemDetails.Title;
  const categorization = categorizeVoteItemText({
    itemTitle,
    motionText: extraction.motionText,
    summaryText: extraction.summaryText,
    sourceExcerpt: extraction.sourceExcerpt,
  });
  const voteItem: PersistedMinutesVoteItem = {
    agendaSection: response.itemDetails.Level > 1 ? response.itemDetails.Title : null,
    itemTitle,
    summaryText: extraction.summaryText,
    summarySource: "minutes_payload",
    summaryConfidenceScore: extraction.confidenceScore,
    motionText: extraction.motionText,
    motionMadeBy: extraction.motionMaker,
    motionSecondedBy: extraction.seconder,
    result: extraction.finalResultText,
    voteShape: extraction.voteShape,
    isNonUnanimous:
      extraction.voteShape === "mixed" ||
      voteTally.no > 0 ||
      voteTally.abstain > 0 ||
      (extraction.tally?.no ?? 0) > 0 ||
      (extraction.tally?.abstain ?? 0) > 0,
    voteTally,
    sourceExcerpt: extraction.sourceExcerpt,
    verificationStatus: extraction.verificationStatus,
    detectedPattern: extraction.detectedPattern,
    confidenceScore: extraction.confidenceScore,
    category: categorization.category,
    categoryConfidence: categorization.categoryConfidence,
  };

  const voteRecords = extraction.memberVotes.map((vote) => ({
    memberName: vote.member,
    voteValue: vote.vote,
    source: vote.source,
    evidence: vote.evidence,
  }));

  return {
    meetingId: response.MeetingId,
    meetingTitle: response.Meeting?.Title ? response.Meeting.Title : null,
    meetingDateText: response.Meeting?.TitleDateTime ? response.Meeting.TitleDateTime : null,
    agendaItemId: response.itemDetails.EncrID,
    agendaParentId: response.itemDetails.EncrParentID,
    itemTitle,
    rawSourceEvidence: {
      minutesText: extraction.minutesText,
      votingLines: extraction.votingLines,
      tallyText: extraction.tally?.rawText ?? null,
    },
    voteItem,
    voteRecords,
    extraction,
    failureReasons: extraction.failureReasons,
  };
};
