export type BoardMember = {
  id: number;
  name: string;
  district?: string | null;
};

export type Meeting = {
  id: number;
  date: string;
  title: string;
  type: string;
  simbliId: string;
  sourceUrl: string;
  minutesUrl?: string | null;
  voteItemCount?: number;
  ingestionStatus: string;
  verificationStatus: string;
};

export type VoteRecord = {
  id: number;
  boardMemberId: number | null;
  voteValue: string;
  boardMember?: BoardMember | null;
};

export type VoteItem = {
  id: number;
  meetingId: number;
  agendaSection?: string | null;
  itemTitle: string;
  summaryText?: string | null;
  motionText?: string | null;
  motionMadeBy?: string | null;
  motionSecondedBy?: string | null;
  result?: string | null;
  isNonUnanimous: boolean;
  voteTally: Record<string, number>;
  sourceExcerpt?: string | null;
  summarySource?: string | null;
  verificationStatus: string;
  detectedPattern?: string | null;
  confidenceScore?: string | number | null;
  category?: string;
  categoryConfidence?: string | number | null;
  sourceUrl?: string | null;
  sourceAvailability?: "available" | "unavailable";
  sourceLabel?: string;
  meeting?: Meeting;
  voteRecords?: VoteRecord[];
};

export type MemberStat = {
  memberId: number;
  name: string;
  totalVotes: number;
  yesCount: number;
  noCount: number;
  abstainCount: number;
  recusedCount: number;
  absentCount: number;
  dissentCount: number;
  dissentRate: number;
  majorityAlignmentRate: number;
  unanimousParticipation: number;
  nonUnanimousParticipation: number;
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
  confidenceScore: string | number | null;
  sourceExcerpt: string | null;
  category: string;
  categoryConfidence: string | number | null;
  memberVote: "No";
  overallOutcome: string;
};

export type PairwiseAlignment = {
  memberAId: number;
  memberBId: number;
  sameVotes: number;
  differentVotes: number;
  overlap: number;
  alignmentRate: number;
  splitRate: number;
};

export type SummaryStats = {
  totalMeetings: number;
  totalVotes: number;
  totalVoteRecords: number;
  nonUnanimousCount: number;
  dissentLeaderboard: {
    memberId: number;
    name: string;
    dissentCount: number;
    totalVotes: number;
    dissentRate: number;
  }[];
  yesLeaderboard: {
    memberId: number;
    name: string;
    yesRate: number;
    yesCount: number;
    totalVotes: number;
  }[];
};
