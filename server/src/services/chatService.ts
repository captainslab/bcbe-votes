import { getCategoryStats, getMemberStats, getPairwiseAlignment, getSummaryStats } from "./analyticsService";
import {
  type ChatMeetingSummary,
  type ChatVoteSummary,
  canonicalBoardMembers,
  getCategoryCount,
  getMemberCategoryBreakdown,
  getMemberVoteStats,
  getPersonnelActions,
  getPropertyTransactions,
  getRecentMeetingSummaries,
  getRecentNonUnanimousVotes,
  getRecentVoteSummaries,
  searchVoteItemsForChat,
} from "./dataService";

export type ChatContext = {
  totalMeetings: number;
  totalVotes: number;
  totalVoteRecords: number;
  nonUnanimousCount?: number;
  needsReviewCount?: number;
  topCategory?: string;
  topCategoryVotes?: number;
};

export type ChatCitation = {
  label: string;
  path?: string;
};

export type ChatResponse = {
  answer: string;
  citations: ChatCitation[];
  suggestions: string[];
  scope: "answered" | "refused" | "fallback";
  modelUsed: "approved-faq" | "site-data" | "gpt-4o-mini" | "setup-required";
};

type AnswerInput = {
  question: string;
  context: ChatContext;
  previousQuestion?: string;
  previousAssistantAnswer?: string;
  useModel?: boolean;
};

type RateLimitBucket = {
  windowStart: number;
  count: number;
};

// Intent classification types
type DataQueryIntent =
  | { type: "member_vote_stats"; memberName: string }
  | { type: "member_category_breakdown"; memberName: string }
  | { type: "member_leaderboard"; metric: "dissent_rate" | "yes_rate" | "vote_volume" }
  | { type: "recent_meetings"; limit: number }
  | { type: "recent_votes"; limit: number }
  | { type: "recent_non_unanimous"; limit: number }
  | { type: "category_overview" }
  | { type: "category_count"; category: string }
  | { type: "alignment_highlights"; direction: "most_aligned" | "most_split" }
  | { type: "vote_search"; searchTerm: string; limit: number }
  | { type: "property_transactions"; actionType?: string }
  | { type: "personnel_actions"; actionType?: string }
  | { type: "faq" };

const FALLBACK_ANSWER = "I don't know from BoardVotes.io data.";
const MOTIVE_ANSWER = "BoardVotes.io records vote outcomes, but it does not provide reasons unless the public source states them.";
const MAX_QUESTION_LENGTH = 500;
const CHAT_RATE_LIMIT_WINDOW_MS = 60_000;
const CHAT_RATE_LIMIT_MAX = 12;
const OPENROUTER_MODEL = "openai/gpt-4o-mini";
const rateLimitBuckets = new Map<string, RateLimitBucket>();

const suggestions = [
  "What happened at the latest meeting?",
  "Which member has the highest dissent rate?",
  "What topics does the board vote on most?",
  "Find votes about mental health",
];

const blockedTitlePrefixes = ["M" + "r", "M" + "rs", "M" + "s", "M" + "iss", "D" + "r"];
const titlePrefixPattern = new RegExp(`(^|[^A-Za-z])(?:${blockedTitlePrefixes.join("|")})\\.?(?=\\s|$|[^A-Za-z])`, "i");

export const containsTitlePrefix = (value: string) => titlePrefixPattern.test(value);

export const sanitizeChatAnswer = (value: string) => {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized) return FALLBACK_ANSWER;
  if (containsTitlePrefix(normalized)) return FALLBACK_ANSWER;
  return normalized;
};

export const buildChatContext = (context: ChatContext): ChatContext => {
  const chatContext: ChatContext = {
    totalMeetings: context.totalMeetings,
    totalVotes: context.totalVotes,
    totalVoteRecords: context.totalVoteRecords,
  };
  if (typeof context.nonUnanimousCount === "number") chatContext.nonUnanimousCount = context.nonUnanimousCount;
  if (typeof context.needsReviewCount === "number") chatContext.needsReviewCount = context.needsReviewCount;
  if (typeof context.topCategory === "string") chatContext.topCategory = context.topCategory;
  if (typeof context.topCategoryVotes === "number") chatContext.topCategoryVotes = context.topCategoryVotes;
  return chatContext;
};

export const buildCurrentChatContext = async (): Promise<ChatContext> => {
  const [summary, categoryStats] = await Promise.all([getSummaryStats(), getCategoryStats()]);
  const topCategory = categoryStats[0]?.category;
  const topCategoryVotes = categoryStats[0]?.totalVotes;
  return buildChatContext({
    ...summary,
    ...(topCategory ? { topCategory } : {}),
    ...(typeof topCategoryVotes === "number" ? { topCategoryVotes } : {}),
  });
};

export const isChatRateLimited = (key: string, now = Date.now()) => {
  const bucket = rateLimitBuckets.get(key);
  if (!bucket || now - bucket.windowStart >= CHAT_RATE_LIMIT_WINDOW_MS) {
    rateLimitBuckets.set(key, { windowStart: now, count: 1 });
    return false;
  }

  bucket.count += 1;
  return bucket.count > CHAT_RATE_LIMIT_MAX;
};

const normalizeQuestion = (question: string) => question.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

const formatPercent = (value: number) => {
  const percent = value * 100;
  return `${Number.isInteger(percent) ? percent.toFixed(0) : percent.toFixed(1)}%`;
};

const formatCount = (value: number, singular: string, plural = `${singular}s`) =>
  `${value} ${value === 1 ? singular : plural}`;

const getRequestedLimit = (q: string, fallback: number) => {
  const match = q.match(/\b([1-9]|1[0-9]|20)\b/);
  if (!match?.[1]) return fallback;
  return Math.min(Math.max(Number(match[1]), 1), 20);
};

const findCanonicalMemberInQuestion = (q: string) =>
  canonicalBoardMembers.find((memberName) => {
    const normalizedName = normalizeQuestion(memberName);
    const shortName = normalizeQuestion(memberName.replace(/\bP\b\.?/i, ""));
    return q.includes(normalizedName) || q.includes(shortName);
  });

const categoryAliases: Array<{ category: string; patterns: RegExp[] }> = [
  { category: "Personnel", patterns: [/\bpersonnel|hiring|hire|resignation|retirement|staff|transfer\b/] },
  { category: "Budget & Finance", patterns: [/\bbudget|finance|financial|spending|salary|audit\b/] },
  { category: "Contracts & Procurement", patterns: [/\bcontract|procurement|vendor|bid|purchase\b/] },
  { category: "Facilities & Property", patterns: [/\bfacility|facilities|property|construction|renovation|lease\b/] },
  { category: "Policy & Governance", patterns: [/\bpolicy|governance|resolution|committee|election\b/] },
  { category: "Curriculum & Academics", patterns: [/\bcurriculum|academic|instruction|textbook|assessment\b/] },
  { category: "Student Services", patterns: [/\bstudent|mental health|counseling|special education\b/] },
  { category: "Safety & Operations", patterns: [/\bsafety|security|operations|emergency\b/] },
  { category: "Transportation", patterns: [/\btransportation|bus|fleet|vehicle\b/] },
  { category: "Technology", patterns: [/\btechnology|software|device|computer|network\b/] },
  { category: "Legal & Compliance", patterns: [/\blegal|compliance|litigation|settlement|attorney\b/] },
  { category: "Athletics & Extracurricular", patterns: [/\bathletic|athletics|sport|coach|band|field trip\b/] },
  { category: "Grants & Federal Programs", patterns: [/\bgrant|federal|title|esser|arpa|idea\b/] },
  { category: "Routine Administration", patterns: [/\broutine|administration|minutes|calendar|agenda\b/] },
];

const findCategoryInQuestion = (q: string) =>
  categoryAliases.find(({ patterns }) => patterns.some((pattern) => pattern.test(q)))?.category;

const extractSearchTerm = (question: string) => {
  const cleaned = question.trim().replace(/[?.!]+$/g, "");
  const patterns = [
    /\b(?:find|search|show|pull up|look up)\s+(?:me\s+)?(?:the\s+)?(?:votes?|items?|records?)?\s*(?:about|for|on|related to)?\s+(.+)$/i,
    /\b(?:votes?|items?|records?)\s+(?:about|for|on|related to)\s+(.+)$/i,
    /\b(?:anything|data|information)\s+(?:about|for|on|related to)\s+(.+)$/i,
  ];

  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    const rawTerm = match?.[1]?.trim();
    if (!rawTerm) continue;
    const term = rawTerm
      .replace(/\b(?:on the site|from the site|in boardvotes|on boardvotes|please|thanks)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    const normalized = normalizeQuestion(term);
    if (normalized.length >= 3 && !/^(votes?|items?|records?|data|the board|board)$/.test(normalized)) {
      return term;
    }
  }

  return null;
};

const baseResponse = (answer: string, scope: ChatResponse["scope"], citations: ChatCitation[] = []): ChatResponse => ({
  answer: sanitizeChatAnswer(answer),
  citations,
  suggestions,
  scope,
  modelUsed: "approved-faq",
});

const isVotingAlignmentContext = (value: string) => /\b(voting alignment|alignment|alliances|voted together|voted similarly|voted differently)\b/.test(normalizeQuestion(value));

const classifyIntentLocally = (question: string): DataQueryIntent => {
  const q = normalizeQuestion(question);
  const limit = getRequestedLimit(q, 8);

  if (/\b(latest|recent|last|newest|most recent)\b.*\bmeetings?\b/.test(q) || /\bwhat happened\b.*\bmeetings?\b/.test(q)) {
    return { type: "recent_meetings", limit: getRequestedLimit(q, 1) };
  }

  if (/\b(latest|recent|last|newest|lately)\b.*\b(votes?|items?|actions?)\b/.test(q) || /\bwhat has the board been voting on\b/.test(q)) {
    return { type: "recent_votes", limit };
  }

  if (/\b(non unanimous|nonunanimous|not unanimous|split votes?|disagreements?)\b/.test(q) && /\b(show|list|recent|latest|which|what|find)\b/.test(q)) {
    return { type: "recent_non_unanimous", limit };
  }

  if (/\b(who|which member|top|highest|most)\b.*\b(dissent|no votes?|abstain|split)\b/.test(q)) {
    return { type: "member_leaderboard", metric: "dissent_rate" };
  }

  if (/\b(who|which member|top|highest|most)\b.*\b(yes|approval|majority alignment)\b/.test(q)) {
    return { type: "member_leaderboard", metric: "yes_rate" };
  }

  if (/\b(who|which member|top|highest|most)\b.*\b(votes?|participation|records?)\b/.test(q)) {
    return { type: "member_leaderboard", metric: "vote_volume" };
  }

  if (
    /\b(top|most|common|dominant|overview|breakdown)\b.*\b(categories|category|topics?|areas)\b/.test(q) ||
    /\bwhat\s+(topics?|categories|areas)\b.*\b(board|votes?|voted)\b/.test(q) ||
    /\bboard\b.*\bvotes?\s+on\s+most\b/.test(q) ||
    /\bwhat does the board vote on\b/.test(q)
  ) {
    return { type: "category_overview" };
  }

  if (/\b(who|which members?)\b.*\b(vote together|align|aligned|similar)\b/.test(q) || /\bmost aligned\b/.test(q)) {
    return { type: "alignment_highlights", direction: "most_aligned" };
  }

  if (/\b(who|which members?)\b.*\b(disagree|differ|different|split)\b/.test(q) || /\b(most split|least aligned)\b/.test(q)) {
    return { type: "alignment_highlights", direction: "most_split" };
  }

  const memberName = findCanonicalMemberInQuestion(q);
  if (memberName && /\b(categories|category|topics?|breakdown|no|abstain|dissent)\b/.test(q)) {
    return { type: "member_category_breakdown", memberName };
  }
  if (memberName && /\b(votes?|records?|stats?|yes|no|abstain|dissent|total)\b/.test(q)) {
    return { type: "member_vote_stats", memberName };
  }

  const category = findCategoryInQuestion(q);
  if (category && /\b(how many|count|total|number of)\b/.test(q)) {
    return { type: "category_count", category };
  }

  if (/\b(property|real estate|lease|purchase|sale|easement|conveyance|construction|renovation)\b/.test(q)) {
    const actionType = ["purchase", "sale", "lease", "easement", "conveyance", "construction", "renovation"].find((word) =>
      q.includes(word),
    );
    return { type: "property_transactions", ...(actionType ? { actionType } : {}) };
  }

  if (/\b(personnel|hiring|hire|resignation|resignations|retirement|retirements|appointments?|termination|transfer|leave)\b/.test(q)) {
    const actionType = ["appointment", "resignation", "retirement", "termination", "transfer", "leave"].find((word) =>
      q.includes(word),
    );
    return { type: "personnel_actions", ...(actionType ? { actionType } : {}) };
  }

  const searchTerm = extractSearchTerm(question);
  if (searchTerm) return { type: "vote_search", searchTerm, limit };

  return { type: "faq" };
};

const faqAnswer = (question: string, context: ChatContext, previousQuestion = "", previousAssistantAnswer = ""): ChatResponse | null => {
  const q = normalizeQuestion(question);

  if (/\b(why does that matter|why is that important|why should i care|so what|what does that tell me)\b/.test(q)) {
    if (isVotingAlignmentContext(previousQuestion) || isVotingAlignmentContext(previousAssistantAnswer)) {
      return baseResponse(
        "Voting Alignment matters because it helps visitors decide what to inspect next: which board members often voted similarly or differently across recorded vote items. It is a starting point for reviewing public records, not proof of motives, coordination, or personal alliances.",
        "answered",
        [{ label: "Voting Alignment", path: "/alliances" }, { label: "Votes", path: "/votes" }],
      );
    }
  }

  if (/\b(who should i vote for|who to vote for|endorse|recommend a candidate|voter advice|political advice)\b/.test(q)) {
    return baseResponse(
      "BoardVotes.io does not provide political endorsements or voter advice. It presents source-traceable meeting and vote data so visitors can review the records themselves.",
      "refused",
      [{ label: "Members", path: "/members" }, { label: "Votes", path: "/votes" }],
    );
  }

  if (/\b(why did|reason|motive|motivation|intent)\b/.test(q)) {
    return baseResponse(MOTIVE_ANSWER, "refused", [{ label: "Votes", path: "/votes" }]);
  }

  if (/\b(database|db|table|schema|sql|admin|server|environment|api key|secret|internal)\b/.test(q)) {
    return baseResponse(
      "BoardVotes.io only exposes public pages and public API data to visitors. Use the Meetings, Votes, Members, and Voting Alignment pages to review public records.",
      "refused",
      [
        { label: "Meetings", path: "/meetings" },
        { label: "Votes", path: "/votes" },
        { label: "Members", path: "/members" },
      ],
    );
  }

  if (/\b(what is boardvotes|what is this site|about boardvotes|what does boardvotes do)\b/.test(q)) {
    return baseResponse(
      `BoardVotes.io is a public, independent site for browsing source-traceable Baldwin County Board of Education meeting and vote data. It currently shows ${context.totalMeetings} meetings, ${context.totalVotes} vote items, and ${context.totalVoteRecords} extracted vote records where available.`,
      "answered",
      [{ label: "Dashboard", path: "/" }, { label: "Votes", path: "/votes" }],
    );
  }

  if (/\b(official|government site|bcbe site|county site)\b/.test(q)) {
    return baseResponse(
      "No. BoardVotes.io is not an official government site. It presents source-traceable meeting and vote data and links back to available public source records where possible.",
      "answered",
      [{ label: "Meetings", path: "/meetings" }],
    );
  }

  if (/\b(years|covered|coverage|date range|how far back)\b/.test(q)) {
    return baseResponse(
      "The site includes extracted vote records from 2020 through 2026. Coverage may vary by meeting type and source quality.",
      "answered",
      [{ label: "Meetings", path: "/meetings" }],
    );
  }

  if (/\b(needs review|need review|review means)\b/.test(q)) {
    return baseResponse(
      "Needs Review means the site does not yet have strong enough source evidence or parsing confidence for that displayed item. Treat it as a flag to check the source details before relying on the text.",
      "answered",
      [{ label: "Votes", path: "/votes" }],
    );
  }

  if (/\b(verified|verification)\b/.test(q)) {
    return baseResponse(
      "Verified means the site has strong source evidence for the displayed vote information. It does not mean every public source is perfect.",
      "answered",
      [{ label: "Votes", path: "/votes" }],
    );
  }

  if (/\b(what does|what is|means?|meaning|define|explain)\b.*\b(non unanimous|nonunanimous|not unanimous|split vote)\b/.test(q)) {
    return baseResponse(
      "Non-unanimous means at least one recorded vote differed from the others, such as a no vote, abstention, recusal, or absence in the extracted vote records.",
      "answered",
      [{ label: "Votes", path: "/votes" }],
    );
  }

  if (/\b(zero individual|no individual|no vote records|no individual records|0 individual)\b/.test(q)) {
    return baseResponse(
      "Some vote items have no individual records because the public source may report only the outcome or the extraction may not identify individual member votes. Check the related meeting or vote page for source details and review status.",
      "answered",
      [{ label: "Votes", path: "/votes" }, { label: "Meetings", path: "/meetings" }],
    );
  }

  if (/\b(find a board member|find member|members page|how do i find.*member|where.*member.*page)\b/.test(q)) {
    return baseResponse(
      "Use the Members page to browse canonical public board member statistics. Member detail pages show extracted vote totals, dissent counts, and sourced profile details where available.",
      "answered",
      [{ label: "Members", path: "/members" }],
    );
  }

  if (/\b(find a vote|find vote|vote page|votes page|search votes)\b/.test(q) && !extractSearchTerm(question)) {
    return baseResponse(
      "Use the Votes page to review extracted vote items. Open a vote detail page to see the meeting, source status, category, motion text when available, and individual records when extracted.",
      "answered",
      [{ label: "Votes", path: "/votes" }],
    );
  }

  if (
    /\b(what does|what is|means?|meaning|define|explain)\b.*\b(voting alignment|alignment|alliances|voted together|voted similarly)\b/.test(q) &&
    !/\bcategory alignment\b/.test(q)
  ) {
    return baseResponse(
      "Voting Alignment shows how often board members voted similarly or differently across recorded vote items. It is a pattern tool, not proof of motives, coordination, or personal alliances.",
      "answered",
      [{ label: "Voting Alignment", path: "/alliances" }],
    );
  }

  if (/\b(report a correction|correction|wrong|error|fix|missing link|report)\b/.test(q)) {
    return baseResponse(
      "To report a correction, include the meeting date, item title, what looks wrong, and any source link or context you have. If a source link is unavailable, include the meeting date, item title, and missing link details so it can be reviewed.",
      "answered",
      [{ label: "Meetings", path: "/meetings" }, { label: "Votes", path: "/votes" }],
    );
  }

  if (/\b(source unavailable|source link|missing source|unavailable source)\b/.test(q)) {
    return baseResponse(
      "If a source link is unavailable, check the related meeting or vote page for other source details. You can also report the meeting date, item title, and missing link so it can be reviewed.",
      "answered",
      [{ label: "Meetings", path: "/meetings" }, { label: "Votes", path: "/votes" }],
    );
  }

  if (/\b(bias|biased|neutral|trust)\b/.test(q)) {
    return baseResponse(
      "BoardVotes.io presents source-traceable meeting and vote data. Visitors should review the source records and decide how to interpret the information.",
      "answered",
      [{ label: "Meetings", path: "/meetings" }, { label: "Votes", path: "/votes" }],
    );
  }

  if (/\b(?:list|which|how many)\s+categor(?:y|ies)?\b/.test(q) || /\bwhat\s+categor(?:y|ies)?\s+(?:exist|available|types?|are there)\b/.test(q)) {
    return baseResponse(
      "BoardVotes.io uses 15 vote-topic categories: Budget & Finance, Personnel, Contracts & Procurement, Facilities & Property, Policy & Governance, Curriculum & Academics, Student Services, Safety & Operations, Legal & Compliance, Technology, Transportation, Athletics & Extracurricular, Grants & Federal Programs, Routine Administration, and Other / Needs Review. Use the Category filter on the Votes page to browse by topic.",
      "answered",
      [{ label: "Votes", path: "/votes" }],
    );
  }

  if (/\b(what does|what is|means?|meaning|define|explain)\b.*\bpersonnel(?:\s+category)?\b/.test(q)) {
    return baseResponse(
      "The Personnel category covers vote items about staffing, hiring, appointments, leaves of absence, resignations, retirements, and similar employment matters.",
      "answered",
      [{ label: "Votes", path: "/votes" }],
    );
  }

  if (/\b(find contract|contract vote|procurement vote|vendor vote|find procurement|contract category)\b/.test(q)) {
    return baseResponse(
      "Use the Votes page and filter by 'Contracts & Procurement' to find extracted vote items about vendor contracts, bids, and procurement decisions.",
      "answered",
      [{ label: "Votes", path: "/votes" }],
    );
  }

  if (/\b(top category|most votes category|most common category|category has the most|which category|biggest category)\b/.test(q)) {
    const topCat = context.topCategory;
    if (!topCat) return baseResponse(FALLBACK_ANSWER, "fallback");
    const countText = typeof context.topCategoryVotes === "number" ? ` with ${formatCount(context.topCategoryVotes, "vote item")}` : "";
    return baseResponse(
      `Based on extracted vote records, ${topCat} is the most common vote-topic category on BoardVotes.io${countText}. Use the Votes page and filter by category to explore vote items in any topic area.`,
      "answered",
      [{ label: "Votes", path: "/votes" }],
    );
  }

  if (/\b(category alignment|alignment by category|category filter alignment|filter.*alignment|alignment.*category)\b/.test(q)) {
    return baseResponse(
      "Category alignment shows vote-pattern similarity within a specific topic area. It is not proof of motive, coordination, or personal alliance. Use the Category filter on the Voting Alignment page to compare how members voted within a topic.",
      "answered",
      [{ label: "Voting Alignment", path: "/alliances" }],
    );
  }

  return null;
};

const buildApprovedContextPrompt = (context: ChatContext) => `You are the BoardVotes.io assistant. Answer only from this approved site context.
Rules:
- Answer only about BoardVotes.io site navigation, definitions, coverage, and public data limitations.
- Do not provide political endorsements, voter advice, motive speculation, or unsupported claims.
- Do not expose database, server, admin, environment, or API-key details.
- If the answer is unavailable, say exactly: "${FALLBACK_ANSWER}"
- If asked about motives, say exactly: "${MOTIVE_ANSWER}"
- Never use title-prefix honorific language.
Approved facts:
- BoardVotes.io is an independent public site for browsing source-traceable meeting and vote data.
- It is not an official government site.
- Coverage: The site includes extracted vote records from 2020 through 2026. Coverage may vary by meeting type and source quality.
- Current public counts: ${context.totalMeetings} meetings, ${context.totalVotes} vote items, ${context.totalVoteRecords} extracted vote records.
- Verified means the site has strong source evidence for displayed vote information. It does not mean every public source is perfect.
- Needs Review means source evidence or parsing confidence is not strong enough yet.
- Non-unanimous means at least one recorded vote differed from the others.
- Some vote items have no individual records because the public source may report only the outcome or extraction may not identify individual votes.
- Voting Alignment shows how often board members voted similarly or differently across recorded vote items. It is not proof of motives, coordination, or personal alliances.
- Category alignment shows vote-pattern similarity within a specific topic area. It is not proof of motive, coordination, or personal alliance.
- Vote-topic categories: Budget & Finance, Personnel, Contracts & Procurement, Facilities & Property, Policy & Governance, Curriculum & Academics, Student Services, Safety & Operations, Legal & Compliance, Technology, Transportation, Athletics & Extracurricular, Grants & Federal Programs, Routine Administration, Other / Needs Review.
- Use the Category filter on the Votes page or the Voting Alignment page to browse by topic.${context.topCategory ? `\n- Most common category by extracted vote count: ${context.topCategory}.` : ""}
- Correction reports should include meeting date, item title, what looks wrong, and source context when available.`;

// ---------------------------------------------------------------------------
// OpenRouter helpers
// ---------------------------------------------------------------------------

const postToOpenRouter = async (messages: Array<{ role: string; content: string }>, maxTokens = 220): Promise<string | null> => {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://boardvotes.io",
        "X-Title": "BoardVotes.io",
      },
      body: JSON.stringify({ model: OPENROUTER_MODEL, messages, max_completion_tokens: maxTokens, temperature: 0 }),
    });

    if (!response.ok) return null;
    const payload = await response.json() as {
      choices?: Array<{ message?: { content?: string | Array<{ text?: string; type?: string }> } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (typeof content === "string") return content;
    for (const item of content ?? []) {
      if (typeof item.text === "string") return item.text;
    }
  } catch {
    return null;
  }
  return null;
};

const callOpenRouter = async (question: string, approvedAnswer: string, context: ChatContext): Promise<string | null> =>
  postToOpenRouter([
    { role: "system", content: buildApprovedContextPrompt(context) },
    {
      role: "user",
      content: `Visitor question: ${question}\n\nApproved answer to preserve exactly in meaning and scope: ${approvedAnswer}\n\nReturn one short visitor-facing answer. Do not add facts, names, counts, reasons, or claims beyond the approved answer.`,
    },
  ]);

const buildFreeformContextPrompt = (context: ChatContext) =>
  `You are a friendly, knowledgeable assistant for BoardVotes.io — a public site tracking Baldwin County Board of Education votes and meetings. You talk like a helpful expert friend who happens to know all the data on the site.
Rules:
- Be conversational and natural, not like a formal report or FAQ bot.
- Answer based only on what the site covers — don't speculate about motives, endorse candidates, or give political advice.
- Do not expose database, server, admin, environment, or API-key details.
- If you don't have the answer from the data available, point the visitor to the most relevant page (Meetings, Votes, Members, Voting Alignment, Motions, or Property) in a natural way.
- Never use honorific title prefixes (Mr., Mrs., Ms., Dr.).
Site facts:
- Independent public site tracking Baldwin County Board of Education meeting and vote data (not an official government site).
- Coverage: extracted vote records from 2020 through 2026.
- Current counts: ${context.totalMeetings} meetings, ${context.totalVotes} vote items, ${context.totalVoteRecords} extracted vote records.
- Pages: Meetings, Votes (with category filter), Members (stats and dissent rates), Voting Alignment (pairwise similarity), Motions, Property.
- Vote-topic categories: Budget & Finance, Personnel, Contracts & Procurement, Facilities & Property, Policy & Governance, Curriculum & Academics, Student Services, Safety & Operations, Legal & Compliance, Technology, Transportation, Athletics & Extracurricular, Grants & Federal Programs, Routine Administration.${context.topCategory ? `\n- Most common category by vote count: ${context.topCategory}.` : ""}`;

const callOpenRouterFreeform = async (question: string, context: ChatContext): Promise<string | null> =>
  postToOpenRouter([
    { role: "system", content: buildFreeformContextPrompt(context) },
    { role: "user", content: question },
  ]);

// ---------------------------------------------------------------------------
// Intent classification via gpt-4o-mini
// ---------------------------------------------------------------------------

const INTENT_SYSTEM_PROMPT = `You are an intent classifier for BoardVotes.io, a school board vote tracking site.
Classify the user question into one of these intents. Return JSON only — no markdown.

Intents:
- member_vote_stats: question about a specific board member's vote counts (yes/no/abstain totals, dissent rate)
- member_category_breakdown: question about which categories a specific member votes no/abstain on
- member_leaderboard: question about which member ranks highest by dissent rate, yes rate, or vote volume
- recent_meetings: question about the latest or most recent meeting
- recent_votes: question about recent vote items or what the board has been voting on
- recent_non_unanimous: question about recent split votes, disagreements, or non-unanimous votes
- category_overview: question about top topics, category breakdown, or what the board votes on most
- category_count: question about how many votes are in a category (personnel, budget, contracts, etc.)
- alignment_highlights: question about which members vote together most or differ most
- vote_search: question asking to find or search vote items by keyword/topic
- property_transactions: question about property purchases, sales, leases, or real estate actions
- personnel_actions: question about hiring, retirements, appointments, resignations
- faq: anything else (site navigation, definitions, general questions)

Board members: ${canonicalBoardMembers.join(", ")}

Return exactly this JSON shape:
{
  "type": "<intent>",
  "memberName": "<canonical name or null>",
  "category": "<category string or null>",
  "metric": "<dissent_rate, yes_rate, vote_volume, or null>",
  "direction": "<most_aligned, most_split, or null>",
  "searchTerm": "<keyword/topic or null>",
  "actionType": "<action type string or null>",
  "limit": <number or null>
}`;

const classifyIntent = async (question: string): Promise<DataQueryIntent> => {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return { type: "faq" };

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://boardvotes.io",
        "X-Title": "BoardVotes.io",
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [
          { role: "system", content: INTENT_SYSTEM_PROMPT },
          { role: "user", content: question },
        ],
        max_completion_tokens: 120,
        temperature: 0,
      }),
    });

    if (!response.ok) return { type: "faq" };

    const payload = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = payload.choices?.[0]?.message?.content ?? "";
    const trimmed = raw.trim().replace(/^```(?:json)?|```$/g, "").trim();
    const parsed = JSON.parse(trimmed) as {
      type: string;
      memberName?: string | null;
      category?: string | null;
      metric?: string | null;
      direction?: string | null;
      searchTerm?: string | null;
      actionType?: string | null;
      limit?: number | null;
    };

    const t = parsed.type;

    if (t === "member_vote_stats" && parsed.memberName) {
      return { type: "member_vote_stats", memberName: parsed.memberName };
    }
    if (t === "member_category_breakdown" && parsed.memberName) {
      return { type: "member_category_breakdown", memberName: parsed.memberName };
    }
    if (t === "member_leaderboard") {
      const metric = parsed.metric === "yes_rate" || parsed.metric === "vote_volume" ? parsed.metric : "dissent_rate";
      return { type: "member_leaderboard", metric };
    }
    if (t === "recent_meetings") {
      return { type: "recent_meetings", limit: parsed.limit ?? 1 };
    }
    if (t === "recent_votes") {
      return { type: "recent_votes", limit: parsed.limit ?? 8 };
    }
    if (t === "recent_non_unanimous") {
      return { type: "recent_non_unanimous", limit: parsed.limit ?? 8 };
    }
    if (t === "category_overview") {
      return { type: "category_overview" };
    }
    if (t === "category_count" && parsed.category) {
      return { type: "category_count", category: parsed.category };
    }
    if (t === "alignment_highlights") {
      const direction = parsed.direction === "most_split" ? "most_split" : "most_aligned";
      return { type: "alignment_highlights", direction };
    }
    if (t === "vote_search" && parsed.searchTerm) {
      return { type: "vote_search", searchTerm: parsed.searchTerm, limit: parsed.limit ?? 8 };
    }
    if (t === "property_transactions") {
      return { type: "property_transactions", ...(parsed.actionType ? { actionType: parsed.actionType } : {}) };
    }
    if (t === "personnel_actions") {
      return { type: "personnel_actions", ...(parsed.actionType ? { actionType: parsed.actionType } : {}) };
    }
  } catch {
    // fall through to faq
  }

  return { type: "faq" };
};

// ---------------------------------------------------------------------------
// Data answer generation
// ---------------------------------------------------------------------------

const DATA_ANALYST_SYSTEM_PROMPT = `You are a friendly, knowledgeable assistant for BoardVotes.io — a public site tracking Baldwin County Board of Education votes and meetings. You know the data inside and out and you talk to visitors like a helpful expert friend, not a formal analyst.

Rules:
- Be conversational and natural. Write like you're explaining something interesting to a curious person, not generating a report.
- Weave the numbers and patterns into natural sentences rather than bullet lists.
- You can be a little warm or enthusiastic when something is genuinely interesting in the data.
- Keep it focused — don't over-explain. 2-5 sentences is usually enough.
- If something stands out in the data (an unusually high dissent rate, a category dominating votes, two members who almost never disagree), mention it naturally.
- Add a light caveat when relevant: data comes from extracted public records and may not be complete.
- Never invent member names, vote counts, or outcomes not present in the data.
- Never speculate about motives, endorse candidates, or give political advice.
- Do not use honorific title prefixes (Mr., Mrs., Ms., Dr.).
- If the data is empty, say so naturally and suggest where the visitor might look.`;

const generateDataAnswer = async (
  question: string,
  queryResults: unknown,
  previousQuestion?: string,
  previousAssistantAnswer?: string,
): Promise<string | null> => {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;

  const resultsJson = JSON.stringify(queryResults, null, 2).slice(0, 3000);

  const messages: Array<{ role: string; content: string }> = [
    { role: "system", content: DATA_ANALYST_SYSTEM_PROMPT },
  ];
  if (previousQuestion && previousAssistantAnswer) {
    messages.push({ role: "user", content: previousQuestion });
    messages.push({ role: "assistant", content: previousAssistantAnswer });
  }
  messages.push({
    role: "user",
    content: `Question: ${question}\n\nHere is the relevant data from the site:\n${resultsJson}\n\nAnswer the question conversationally based only on this data.`,
  });

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://boardvotes.io",
        "X-Title": "BoardVotes.io",
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages,
        max_completion_tokens: 500,
        temperature: 0.4,
      }),
    });

    if (!response.ok) return null;

    const payload = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return payload.choices?.[0]?.message?.content ?? null;
  } catch {
    return null;
  }
};

// ---------------------------------------------------------------------------
// Data query dispatcher
// ---------------------------------------------------------------------------

type DataAnswerResult = {
  answer: string;
  citations: ChatCitation[];
};

const voteSummaryLabel = (vote: ChatVoteSummary) => {
  const title = vote.displayText !== "Needs review" ? vote.displayText : vote.itemTitle;
  return `${vote.meetingDate || "unknown date"}: ${title}`;
};

const formatVoteSummaryList = (votes: ChatVoteSummary[], maxItems = 3) =>
  votes
    .slice(0, maxItems)
    .map((vote) => {
      const split = vote.noOrAbstainVoters.length > 0
        ? ` Split voters recorded: ${vote.noOrAbstainVoters.join(", ")}.`
        : "";
      const snippet = vote.matchedSnippet ? ` Match: ${vote.matchedSnippet}` : "";
      return `${voteSummaryLabel(vote)} (${vote.category}).${split}${snippet}`;
    })
    .join(" ");

const formatMeetingSummary = (meeting: ChatMeetingSummary) => {
  const topCategories = meeting.categories
    .slice(0, 3)
    .map((entry) => `${entry.category} (${entry.count})`)
    .join(", ");
  const notable = formatVoteSummaryList(meeting.notableVotes, 2);
  const splitText = meeting.nonUnanimousCount > 0
    ? `${meeting.nonUnanimousCount} were non-unanimous`
    : "none were marked non-unanimous";
  return `The latest meeting with extracted vote items in BoardVotes.io data is ${meeting.meetingTitle} on ${meeting.meetingDate}. It has ${formatCount(meeting.voteItemCount, "vote item")}; ${splitText}. Top topics were ${topCategories || "not categorized yet"}.${notable ? ` Notable recorded items: ${notable}` : ""}`;
};

const formatPersonnelActions = (rows: Awaited<ReturnType<typeof getPersonnelActions>>) => {
  if (rows.length === 0) return "I found no matching personnel actions in the extracted BoardVotes.io data.";
  const actionCounts = new Map<string, number>();
  const schoolCounts = new Map<string, number>();
  for (const row of rows) {
    actionCounts.set(row.actionType, (actionCounts.get(row.actionType) ?? 0) + 1);
    if (row.school) schoolCounts.set(row.school, (schoolCounts.get(row.school) ?? 0) + 1);
  }
  const topActions = Array.from(actionCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([action, count]) => `${action} (${count})`)
    .join(", ");
  const topSchools = Array.from(schoolCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([school, count]) => `${school} (${count})`)
    .join(", ");
  const examples = rows
    .slice(0, 3)
    .map((row) => `${row.meetingDate}: ${row.personName}, ${row.actionType}${row.position ? `, ${row.position}` : ""}`)
    .join("; ");
  return `I found ${formatCount(rows.length, "personnel action")} in extracted BoardVotes.io data. The most common action types are ${topActions || "not categorized"}, and the most frequent schools/departments are ${topSchools || "not specified"}. Recent examples: ${examples}.`;
};

const formatPropertyTransactions = (rows: Awaited<ReturnType<typeof getPropertyTransactions>>) => {
  if (rows.length === 0) return "I found no matching property transactions in the extracted BoardVotes.io data.";
  const actionCounts = new Map<string, number>();
  for (const row of rows) actionCounts.set(row.actionType, (actionCounts.get(row.actionType) ?? 0) + 1);
  const topActions = Array.from(actionCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([action, count]) => `${action} (${count})`)
    .join(", ");
  const examples = rows
    .slice(0, 3)
    .map((row) => `${row.meetingDate}: ${row.actionType}${row.location ? ` at ${row.location}` : ""}${row.party ? ` with ${row.party}` : ""}`)
    .join("; ");
  return `I found ${formatCount(rows.length, "property-related action")} in extracted BoardVotes.io data. The action mix is ${topActions || "not categorized"}. Recent examples: ${examples}.`;
};

const buildDeterministicDataAnswer = async (intent: DataQueryIntent): Promise<DataAnswerResult | null> => {
  switch (intent.type) {
    case "member_vote_stats": {
      const stats = await getMemberVoteStats(intent.memberName);
      if (!stats || stats.total === 0) return null;
      return {
        answer: `${stats.name} has ${formatCount(stats.total, "recorded vote")} in BoardVotes.io data: ${stats.yes} yes, ${stats.no} no, ${stats.abstain} abstain, ${stats.recused} recused, and ${stats.absent} absent. The dissent rate is ${formatPercent(stats.dissentRate)} based on extracted vote records, so treat it as a record review signal rather than a statement of motive.`,
        citations: [{ label: "Members", path: "/members" }, { label: "Votes", path: "/votes" }],
      };
    }
    case "member_category_breakdown": {
      const rows = await getMemberCategoryBreakdown(intent.memberName);
      if (rows.length === 0) return null;
      const total = rows.reduce((sum, row) => sum + row.total, 0);
      const topRows = rows.slice(0, 4).map((row) => `${row.category}: ${row.total} total, ${row.no} no, ${row.abstain} abstain`);
      return {
        answer: `${intent.memberName}'s extracted votes span ${formatCount(rows.length, "category", "categories")} and ${formatCount(total, "recorded vote")}. Top categories: ${topRows.join("; ")}. This is based on categorized extracted records, so low-confidence source items may still need review.`,
        citations: [{ label: "Members", path: "/members" }, { label: "Votes", path: "/votes" }],
      };
    }
    case "member_leaderboard": {
      const members = await getMemberStats();
      if (members.length === 0) return null;
      const sorted = [...members].sort((a, b) => {
        if (intent.metric === "dissent_rate") return b.dissentRate - a.dissentRate;
        if (intent.metric === "yes_rate") return (b.yesCount / Math.max(b.totalVotes, 1)) - (a.yesCount / Math.max(a.totalVotes, 1));
        return b.totalVotes - a.totalVotes;
      });
      const top = sorted[0];
      if (!top) return null;
      const runnersUp = sorted
        .slice(1, 4)
        .map((member) => {
          if (intent.metric === "dissent_rate") return `${member.name} (${formatPercent(member.dissentRate)})`;
          if (intent.metric === "yes_rate") return `${member.name} (${formatPercent(member.yesCount / Math.max(member.totalVotes, 1))})`;
          return `${member.name} (${member.totalVotes})`;
        })
        .join(", ");
      const metricText = intent.metric === "dissent_rate"
        ? `highest dissent rate at ${formatPercent(top.dissentRate)} (${top.dissentCount} dissenting records out of ${top.totalVotes})`
        : intent.metric === "yes_rate"
          ? `highest yes rate at ${formatPercent(top.yesCount / Math.max(top.totalVotes, 1))} (${top.yesCount} yes votes out of ${top.totalVotes})`
          : `most recorded votes with ${top.totalVotes}`;
      return {
        answer: `${top.name} has the ${metricText} in the extracted BoardVotes.io member stats. Other high entries: ${runnersUp || "none available"}. These are extracted vote-record patterns, not an explanation of why members voted that way.`,
        citations: [{ label: "Members", path: "/members" }, { label: "Votes", path: "/votes" }],
      };
    }
    case "recent_meetings": {
      const meetings = await getRecentMeetingSummaries(intent.limit);
      if (meetings.length === 0) return null;
      return {
        answer: meetings.map(formatMeetingSummary).join(" "),
        citations: [{ label: "Meetings", path: "/meetings" }, { label: "Votes", path: "/votes" }],
      };
    }
    case "recent_votes": {
      const votes = await getRecentVoteSummaries(intent.limit);
      if (votes.length === 0) return null;
      return {
        answer: `The latest ${formatCount(votes.length, "vote item")} in BoardVotes.io data include: ${formatVoteSummaryList(votes, 5)} Extracted records can be incomplete, so open the vote details for source status and individual records.`,
        citations: [{ label: "Votes", path: "/votes" }, { label: "Meetings", path: "/meetings" }],
      };
    }
    case "recent_non_unanimous": {
      const votes = await getRecentNonUnanimousVotes(intent.limit);
      if (votes.length === 0) return {
        answer: "I found no recent non-unanimous vote items in the extracted BoardVotes.io data.",
        citations: [{ label: "Votes", path: "/votes" }],
      };
      const examples = votes
        .slice(0, 5)
        .map((vote) => {
          const dissenters = vote.noVoters.length > 0 ? ` No/abstain recorded: ${vote.noVoters.join(", ")}.` : "";
          return `${vote.meetingDate}: ${vote.itemTitle} (${vote.category}).${dissenters}`;
        })
        .join(" ");
      return {
        answer: `I found ${formatCount(votes.length, "recent non-unanimous item")} in the extracted data sample. ${examples}`,
        citations: [{ label: "Votes", path: "/votes" }],
      };
    }
    case "category_overview": {
      const rows = await getCategoryStats();
      if (rows.length === 0) return null;
      const total = rows.reduce((sum, row) => sum + row.totalVotes, 0);
      const topRows = rows.slice(0, 5).map((row) => `${row.category} (${row.totalVotes})`);
      return {
        answer: `BoardVotes.io has ${formatCount(total, "categorized vote item")} across ${formatCount(rows.length, "topic category", "topic categories")}. The biggest categories are ${topRows.join(", ")}. Use this as a map of where board activity clusters, then drill into Votes by category for the underlying records.`,
        citations: [{ label: "Votes", path: "/votes" }],
      };
    }
    case "category_count": {
      const row = await getCategoryCount(intent.category);
      if (!row) return null;
      return {
        answer: `${row.category} has ${formatCount(row.total, "vote item")} in BoardVotes.io's extracted data, including ${formatCount(row.nonUnanimous, "non-unanimous item")}. That count comes from text categorization of vote titles, motions, summaries, and excerpts.`,
        citations: [{ label: "Votes", path: "/votes" }],
      };
    }
    case "alignment_highlights": {
      const pairs = await getPairwiseAlignment();
      const sorted = pairs
        .filter((pair) => pair.overlap > 0)
        .sort((a, b) =>
          intent.direction === "most_aligned"
            ? b.alignmentRate - a.alignmentRate || b.overlap - a.overlap
            : b.splitRate - a.splitRate || b.overlap - a.overlap,
        );
      const top = sorted.slice(0, 3);
      if (top.length === 0) return null;
      const label = intent.direction === "most_aligned" ? "most similar voting patterns" : "most split voting patterns";
      const details = top
        .map((pair) =>
          `${pair.memberAName} and ${pair.memberBName}: ${formatPercent(intent.direction === "most_aligned" ? pair.alignmentRate : pair.splitRate)} across ${formatCount(pair.overlap, "shared vote")}`,
        )
        .join("; ");
      return {
        answer: `The ${label} in BoardVotes.io's extracted records are: ${details}. Alignment is a pattern across recorded votes, not evidence of coordination or motive.`,
        citations: [{ label: "Voting Alignment", path: "/alliances" }],
      };
    }
    case "vote_search": {
      const votes = await searchVoteItemsForChat(intent.searchTerm, intent.limit);
      if (votes.length === 0) return {
        answer: `I found no vote items matching "${intent.searchTerm}" in the extracted BoardVotes.io data. Try a broader term on the Votes page, such as a topic, school name, vendor, or action word.`,
        citations: [{ label: "Votes", path: "/votes" }],
      };
      return {
        answer: `I found ${formatCount(votes.length, "vote item")} matching "${intent.searchTerm}" in BoardVotes.io data. ${formatVoteSummaryList(votes, 5)}`,
        citations: [{ label: "Votes", path: "/votes" }],
      };
    }
    case "property_transactions": {
      const rows = await getPropertyTransactions(intent.actionType);
      return {
        answer: formatPropertyTransactions(rows),
        citations: [{ label: "Property", path: "/property" }, { label: "Votes", path: "/votes" }],
      };
    }
    case "personnel_actions": {
      const rows = await getPersonnelActions(intent.actionType);
      return {
        answer: formatPersonnelActions(rows),
        citations: [{ label: "Votes", path: "/votes" }, { label: "Members", path: "/members" }],
      };
    }
    case "faq":
      return null;
  }
};

const answerDataQuestion = async (
  question: string,
  intent: DataQueryIntent,
  previousQuestion?: string,
  previousAssistantAnswer?: string,
): Promise<DataAnswerResult | null> => {
  if (intent.type === "faq") return null;

  // Always try to get raw data and pass to LLM if model is available
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (apiKey) {
    // Fetch data and let the LLM form a natural answer
    let queryResults: unknown = null;
    let citations: ChatCitation[] = [{ label: "Votes", path: "/votes" }];

    switch (intent.type) {
      case "member_vote_stats": {
        queryResults = await getMemberVoteStats(intent.memberName);
        citations = [{ label: "Members", path: "/members" }, { label: "Votes", path: "/votes" }];
        break;
      }
      case "member_category_breakdown": {
        queryResults = await getMemberCategoryBreakdown(intent.memberName);
        citations = [{ label: "Members", path: "/members" }, { label: "Votes", path: "/votes" }];
        break;
      }
      case "member_leaderboard": {
        queryResults = await getMemberStats();
        citations = [{ label: "Members", path: "/members" }, { label: "Votes", path: "/votes" }];
        break;
      }
      case "recent_meetings": {
        queryResults = await getRecentMeetingSummaries(intent.limit);
        citations = [{ label: "Meetings", path: "/meetings" }, { label: "Votes", path: "/votes" }];
        break;
      }
      case "recent_votes": {
        queryResults = await getRecentVoteSummaries(intent.limit);
        citations = [{ label: "Votes", path: "/votes" }];
        break;
      }
      case "recent_non_unanimous": {
        queryResults = await getRecentNonUnanimousVotes(intent.limit);
        citations = [{ label: "Votes", path: "/votes" }];
        break;
      }
      case "category_overview": {
        queryResults = await getCategoryStats();
        citations = [{ label: "Votes", path: "/votes" }];
        break;
      }
      case "category_count": {
        queryResults = await getCategoryCount(intent.category);
        citations = [{ label: "Votes", path: "/votes" }];
        break;
      }
      case "alignment_highlights": {
        queryResults = await getPairwiseAlignment();
        citations = [{ label: "Voting Alignment", path: "/alliances" }];
        break;
      }
      case "vote_search": {
        queryResults = await searchVoteItemsForChat(intent.searchTerm, intent.limit);
        citations = [{ label: "Votes", path: "/votes" }];
        break;
      }
      case "property_transactions": {
        queryResults = await getPropertyTransactions(intent.actionType);
        citations = [{ label: "Property", path: "/property" }, { label: "Votes", path: "/votes" }];
        break;
      }
      case "personnel_actions": {
        queryResults = await getPersonnelActions(intent.actionType);
        citations = [{ label: "Votes", path: "/votes" }, { label: "Members", path: "/members" }];
        break;
      }
    }

    const rawAnswer = await generateDataAnswer(question, queryResults, previousQuestion, previousAssistantAnswer);
    if (rawAnswer) {
      const answer = sanitizeChatAnswer(rawAnswer);
      if (answer !== FALLBACK_ANSWER) return { answer, citations };
    }
  }

  // No API key — fall back to deterministic formatter
  const deterministicAnswer = await buildDeterministicDataAnswer(intent);
  if (deterministicAnswer) return deterministicAnswer;

  return null;
};

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export const answerBoardVotesQuestion = async ({
  question,
  context,
  previousQuestion = "",
  previousAssistantAnswer = "",
  useModel = false,
}: AnswerInput): Promise<ChatResponse> => {
  const trimmedQuestion = question.trim();
  if (!trimmedQuestion) {
    return baseResponse(FALLBACK_ANSWER, "fallback");
  }

  if (trimmedQuestion.length > MAX_QUESTION_LENGTH) {
    return baseResponse("Please ask a shorter question about BoardVotes.io.", "refused");
  }

  // 1. Deterministic FAQ check (always runs first, no LLM cost)
  const deterministic = faqAnswer(trimmedQuestion, context, previousQuestion, previousAssistantAnswer);
  if (deterministic) {
    if (useModel && deterministic.scope === "answered") {
      const modelAnswer = await callOpenRouter(trimmedQuestion, deterministic.answer, context);
      if (modelAnswer) {
        const answer = sanitizeChatAnswer(modelAnswer);
        if (answer !== FALLBACK_ANSWER) {
          return {
            ...deterministic,
            answer,
            modelUsed: "gpt-4o-mini",
          };
        }
      }
    }
    return deterministic;
  }

  // 2. Local data router catches common analytical questions without model dependence.
  const localIntent = classifyIntentLocally(trimmedQuestion);
  if (localIntent.type !== "faq") {
    const dataResult = await answerDataQuestion(trimmedQuestion, localIntent, previousQuestion, previousAssistantAnswer);
    if (dataResult) {
      return {
        answer: dataResult.answer,
        citations: dataResult.citations,
        suggestions,
        scope: "answered",
        modelUsed: process.env.OPENROUTER_API_KEY ? "gpt-4o-mini" : "site-data",
      };
    }
  }

  // 3. If model is available, classify intent and attempt a data query or freeform answer
  if (useModel) {
    const intent = await classifyIntent(trimmedQuestion);

    if (intent.type !== "faq") {
      const dataResult = await answerDataQuestion(trimmedQuestion, intent, previousQuestion, previousAssistantAnswer);
      if (dataResult) {
        return {
          answer: dataResult.answer,
          citations: dataResult.citations,
          suggestions,
          scope: "answered",
          modelUsed: "gpt-4o-mini",
        };
      }
    }

    // Intent was faq or data query returned nothing — try freeform from site context
    const freeformAnswer = await callOpenRouterFreeform(trimmedQuestion, context);
    if (freeformAnswer) {
      const answer = sanitizeChatAnswer(freeformAnswer);
      if (answer !== FALLBACK_ANSWER) {
        return {
          answer,
          citations: [{ label: "Votes", path: "/votes" }, { label: "Members", path: "/members" }],
          suggestions,
          scope: "answered",
          modelUsed: "gpt-4o-mini",
        };
      }
    }
  }

  // 4. Hard fallback
  return {
    answer: "I could not pin that down from BoardVotes.io data yet. Try asking for a board member, topic, latest meeting, recent split votes, property actions, personnel actions, or a keyword to search across vote items.",
    citations: [
      { label: "Votes", path: "/votes" },
      { label: "Members", path: "/members" },
      { label: "Meetings", path: "/meetings" },
    ],
    suggestions,
    scope: "fallback",
    modelUsed: useModel && !process.env.OPENROUTER_API_KEY ? "setup-required" : "approved-faq",
  };
};
