export type PersonnelAction = {
  personName: string;
  actionType: "appointment" | "resignation" | "retirement" | "termination" | "transfer" | "leave" | "other";
  position: string | null;
  schoolOrDepartment: string | null;
  replacing: string | null;
  effectiveDate: string | null;
  classification: "classified" | "certified" | "administrative" | null;
};

export type PropertyAction = {
  actionType: "purchase" | "sale" | "lease" | "easement" | "conveyance" | "construction" | "renovation" | "agreement" | "survey" | "other";
  partyName: string | null;
  location: string | null;
  address: string | null;
  statedUse: string | null;
  term: string | null;
  effectiveDate: string | null;
};

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
  contentText?: string | null;
  personnelEntities?: PersonnelAction[] | null;
  propertyEntities?: PropertyAction[] | null;
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
  isActive: boolean;
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
  topNoAbstainCategory: string | null;
};

export type MemberProfile = {
  canonicalName: string;
  district: string | null;
  roleTitle: string | null;
  officialProfileUrl: string | null;
  officialContactUrl: string | null;
  officialContactEmail: string | null;
  officialPhone: string | null;
  termStart: number | null;
  termEnd: number | null;
  districtDescription: string[] | null;
  committees: string[] | null;
  profileSourceUrls: string[];
  profileVerificationStatus: "verified" | "needs_review";
  profileLastReviewedAt: string | null;
};

export type MemberMotionItem = {
  voteItemId: number;
  meetingId: number;
  meetingDate: string | null;
  meetingTitle: string | null;
  meetingType: string | null;
  sourceUrl: string | null;
  sourceAvailability: "available" | "unavailable";
  itemTitle: string | null;
  motionText: string | null;
  summaryText: string | null;
  isNonUnanimous: boolean;
  voteTally: Record<string, number>;
  verificationStatus: string;
  category: string;
  role: "made" | "seconded";
  personnelEntities?: PersonnelAction[] | null;
  propertyEntities?: PropertyAction[] | null;
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
  personnelEntities?: PersonnelAction[] | null;
  propertyEntities?: PropertyAction[] | null;
};

export type AlignmentSharedVote = {
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

export type PairwiseAlignment = {
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
  sharedVotes?: AlignmentSharedVote[];
};

export type CategoryStat = {
  category: string;
  totalVotes: number;
  nonUnanimousVotes: number;
  byYear: Record<number, number>;
};

export type MemberCategoryStat = {
  category: string;
  totalVotes: number;
  noVotes: number;
};

export type VendorEntry = {
  name: string;
  slug: string;
  categories: string[];
  count: number;
  total_spend: number;
  dollar_amounts: string[];
  vote_item_ids: number[];
  last_seen: string | null;
};

export type VendorContract = {
  voteItemId: number;
  date: string;
  meetingTitle: string;
  itemTitle: string;
  dollarAmountStr: string | null;
  dollarAmount: number;
  outcome: string;
  isNonUnanimous: boolean;
  sourceExcerpt: string | null;
  sourceUrl: string | null;
  voteRecords: Array<{ memberName: string; vote: string }>;
};

export type VendorBoardVote = {
  memberName: string;
  yes: number;
  no: number;
  abstain: number;
  total: number;
};

export type VendorProfile = {
  name: string;
  slug: string;
  aliases: string[];
  categories: string[];
  description: string;
  firstSeen: string;
  lastSeen: string;
  totalContracts: number;
  totalSpend: number;
  fundingSources: string[];
  contracts: VendorContract[];
  boardVoting: VendorBoardVote[];
};

export type VendorsResponse = {
  vendors: VendorEntry[];
  total_procurement_items: number;
  generated_at: string;
};

export type Board = {
  id: number;
  name: string;
  slug: string;
  state: string;
  status: "live" | "coming_soon" | "onboarding";
  description: string | null;
};

export type SummaryStats = {
  totalMeetings: number;
  totalVotes: number;
  totalVoteRecords: number;
  nonUnanimousCount: number;
  needsReviewCount?: number;
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
