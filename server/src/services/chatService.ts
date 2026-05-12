import { getCategoryStats, getMemberStats, getPairwiseAlignment, getSummaryStats } from "./analyticsService";
import {
  type ChatMeetingSummary,
  type ChatVoteSummary,
  canonicalBoardMembers,
  getCategoryCount,
  getExecutiveSessionSummaries,
  getMemberCategoryBreakdown,
  getMemberVoteStats,
  getPersonnelActions,
  getPropertyTransactions,
  getRecentMeetingSummaries,
  getRecentNonUnanimousVotes,
  getRecentVoteSummaries,
  searchVoteItemsForChat,
} from "./dataService";
import { getTranscriptForMeeting } from "./transcriptService";

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
  | { type: "executive_session"; reasonFilter?: string }
  | { type: "faq" };

const FALLBACK_ANSWER = "I don't have that in the BoardVotes.io data.";
const MAX_QUESTION_LENGTH = 500;
const CHAT_RATE_LIMIT_WINDOW_MS = 60_000;
const CHAT_RATE_LIMIT_MAX = 12;
const OPENROUTER_MODEL = "openai/gpt-4o-mini";
const rateLimitBuckets = new Map<string, RateLimitBucket>();

const suggestions = [
  "What happened at the latest meeting?",
  "Which member has the highest dissent rate?",
  "How do I support BoardVotes.io?",
  "How do I add a board?",
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const normalizeQuestion = (question: string) =>
  question.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

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
    if (normalized.length >= 3 && !/^(votes?|items?|records?|data|the board|board)$/.test(normalized)) return term;
  }
  return null;
};

// ---------------------------------------------------------------------------
// System prompt — used for ALL LLM calls
// ---------------------------------------------------------------------------

const buildChatSystemPrompt = (context: ChatContext) =>
  `You are the BoardVotes.io assistant — a sharp, data-first analyst who knows every vote record, meeting, and member stat on this site. You lead with facts and numbers, not with directions to other pages.

CRITICAL — read before anything else:
- When query data is included in the message, answer FROM THAT DATA. Pull out specific numbers, names, dates, outcomes. Never redirect the user to a page when you already have the data to answer.
- Do NOT say "visit the Meetings page" or "check the Votes page" when data has been given to you. That is a failure. Use the data.
- If the data array or result set is empty, THEN you can say nothing was found and mention where to look.

Tone:
- Data-first: open with the actual fact, number, or name. Don't warm up with "Great question!" or "I can help with that."
- Conversational but precise — like a smart colleague summarizing a spreadsheet for you.
- 2–5 sentences. Short is better. Weave numbers into sentences rather than listing them.
- Handle follow-ups naturally using conversation history.

Hard rules — always enforced:
- Only discuss BoardVotes.io and its public data. Anything outside: "that's outside what I cover."
- Never speculate about why a member voted a certain way — describe what the record shows, not the motive.
- Never give political endorsements, voter advice, or candidate recommendations.
- Never reveal database schemas, server internals, API keys, or admin details.
- Never invent vote counts, names, dates, or outcomes not in the provided data.
- Never use honorific prefixes listed in blockedTitlePrefixes.
- Prayer content is not published on BoardVotes.io. If asked about prayers, invocations, religious tone, spiritual analysis, "darker prayers", or any variation — respond only with: "Prayer analysis is not published on BoardVotes.io. I can help with public meeting actions, votes, executive sessions, motions, and source-linked records."
- Never quote, summarize, or analyze prayer text from any source.

What you know about the site:
- BoardVotes.io is an independent public site — not an official government site.
- Tracks Baldwin County Board of Education meeting and vote records extracted from public Simbli pages.
- Coverage: extracted records from 2020 through 2026; varies by meeting.
- Live stats: ${context.totalMeetings} meetings, ${context.totalVotes} vote items, ${context.totalVoteRecords} extracted vote records.${context.topCategory ? ` Most common category by vote count: ${context.topCategory}${context.topCategoryVotes ? ` (${context.topCategoryVotes} items)` : ""}.` : ""}
- Pages: Dashboard, Votes (filterable by category, member, outcome, date), Meetings, Members (stats and dissent rates), Voting Alignment (pairwise vote similarity), Boards, Add a Board, Support.
- Vote-topic categories: Budget & Finance, Personnel, Contracts & Procurement, Facilities & Property, Policy & Governance, Curriculum & Academics, Student Services, Safety & Operations, Legal & Compliance, Technology, Transportation, Athletics & Extracurricular, Grants & Federal Programs, Routine Administration, Other/Needs Review.
- "Verified" = strong source evidence for the displayed vote info. "Needs Review" = not enough confidence — check the source.
- "Non-unanimous" = at least one recorded vote differed (no vote, abstention, recusal, or absence).
- Voting Alignment shows how often members voted similarly across records — not proof of coordination or motive.
- Some vote items have no individual member records because the source only reported the outcome.
- Board members tracked: ${canonicalBoardMembers.join(", ")}.`;

// ---------------------------------------------------------------------------
// Hard refusals — checked before any LLM call
// ---------------------------------------------------------------------------

const checkHardRefusal = (question: string): ChatResponse | null => {
  const q = normalizeQuestion(question);

  if (/\b(prayers?|invocations?|pray(?:ing|ed)?|sermons?|chaplains?)\b/.test(q)) {
    return {
      answer: "Prayer and invocation material is not available in the public BoardVotes.io assistant.",
      citations: [],
      suggestions,
      scope: "refused",
      modelUsed: "approved-faq",
    };
  }

  if (/\b(who should i vote for|who to vote for|endorse|recommend.*candidate|voter advice|political advice)\b/.test(q)) {
    return {
      answer: "I don't do voter advice or endorsements — I just show what's in the public records on BoardVotes.io. Check the Members or Votes pages to review the record yourself.",
      citations: [{ label: "Members", path: "/members" }, { label: "Votes", path: "/votes" }],
      suggestions,
      scope: "refused",
      modelUsed: "approved-faq",
    };
  }

  if (/\b(why did|reason why|motive|motivation|intent)\b.*\b(vote|voted|voting)\b/.test(q)) {
    return {
      answer: "The records show how they voted, but not why. BoardVotes.io doesn't have that — you'd need to check the meeting minutes or contact the board directly.",
      citations: [{ label: "Meetings", path: "/meetings" }],
      suggestions,
      scope: "refused",
      modelUsed: "approved-faq",
    };
  }

  if (/\b(database|db|table|schema|sql|admin|server|environment|api key|secret|internal)\b/.test(q)) {
    return {
      answer: "I only work with the public-facing site data — I can't tell you anything about the underlying infrastructure.",
      citations: [],
      suggestions,
      scope: "refused",
      modelUsed: "approved-faq",
    };
  }

  return null;
};

const checkApprovedFaq = (question: string): ChatResponse | null => {
  const q = normalizeQuestion(question);

  if (
    /\b(how do i|where do i|can i|want to)\b.*\b(support|tip|donat(?:e|ion)s?)\b/.test(q) ||
    /\b(support|tip|donat(?:e|ion)s?)\b.*\b(boardvotes|site|project)\b/.test(q)
  ) {
    return {
      answer: "Use the Support page for a one-time Stripe tip. It helps cover hosting, maintenance, and careful review of public records.",
      citations: [{ label: "Support", path: "/support" }],
      suggestions,
      scope: "answered",
      modelUsed: "approved-faq",
    };
  }

  if (
    /\b(how do i|where do i|can i|want to)\b.*\b(add a board|request a board|board request)\b/.test(q) ||
    /\b(add a board|request a board|board request)\b/.test(q)
  ) {
    return {
      answer: "Use the Add a Board page if you want BoardVotes.io to cover a board that isn't listed yet.",
      citations: [{ label: "Add a Board", path: "/request" }, { label: "Boards", path: "/boards" }],
      suggestions,
      scope: "answered",
      modelUsed: "approved-faq",
    };
  }

  return null;
};

// ---------------------------------------------------------------------------
// OpenRouter
// ---------------------------------------------------------------------------

const postToOpenRouter = async (
  messages: Array<{ role: string; content: string }>,
  maxTokens = 400,
): Promise<string | null> => {
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
      body: JSON.stringify({ model: OPENROUTER_MODEL, messages, max_completion_tokens: maxTokens, temperature: 0.4 }),
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

const generateChatAnswer = async (
  question: string,
  queryResults: unknown,
  context: ChatContext,
  previousQuestion?: string,
  previousAssistantAnswer?: string,
  transcriptContext?: string | null,
): Promise<string | null> => {
  const messages: Array<{ role: string; content: string }> = [
    { role: "system", content: buildChatSystemPrompt(context) },
  ];

  if (previousQuestion && previousAssistantAnswer) {
    messages.push({ role: "user", content: previousQuestion });
    messages.push({ role: "assistant", content: previousAssistantAnswer });
  }

  const transcriptSection = transcriptContext ? `\n\n${transcriptContext}` : "";
  const userContent = queryResults
    ? `Here is relevant data from the site:\n${JSON.stringify(queryResults, null, 2).slice(0, 3000)}${transcriptSection}\n\nQuestion: ${question}`
    : `${question}${transcriptSection}`;

  messages.push({ role: "user", content: userContent });
  return postToOpenRouter(messages, 500);
};

// ---------------------------------------------------------------------------
// Intent classification
// ---------------------------------------------------------------------------

const classifyIntentLocally = (question: string): DataQueryIntent => {
  const q = normalizeQuestion(question);
  const limit = getRequestedLimit(q, 8);

  if (/\b(executive sessions?|closed sessions?)\b/.test(q)) {
    const reasonFilter = /\breal estate\b/.test(q) ? "real estate"
      : /\blitigation\b/.test(q) ? "litigation"
        : undefined;
    return { type: "executive_session", ...(reasonFilter ? { reasonFilter } : {}) };
  }

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
    const actionType = ["purchase", "sale", "lease", "easement", "conveyance", "construction", "renovation"].find((w) => q.includes(w));
    return { type: "property_transactions", ...(actionType ? { actionType } : {}) };
  }
  if (/\b(personnel|hiring|hire|resignation|resignations|retirement|retirements|appointments?|termination|transfer|leave)\b/.test(q)) {
    const actionType = ["appointment", "resignation", "retirement", "termination", "transfer", "leave"].find((w) => q.includes(w));
    return { type: "personnel_actions", ...(actionType ? { actionType } : {}) };
  }

  const searchTerm = extractSearchTerm(question);
  if (searchTerm) return { type: "vote_search", searchTerm, limit };

  return { type: "faq" };
};

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
- executive_session: question about executive sessions, closed sessions, or stated executive-session reasons
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
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const raw = payload.choices?.[0]?.message?.content ?? "";
    const trimmed = raw.trim().replace(/^```(?:json)?|```$/g, "").trim();
    const parsed = JSON.parse(trimmed) as {
      type: string; memberName?: string | null; category?: string | null;
      metric?: string | null; direction?: string | null; searchTerm?: string | null;
      actionType?: string | null; limit?: number | null;
    };
    const t = parsed.type;
    if (t === "member_vote_stats" && parsed.memberName) return { type: "member_vote_stats", memberName: parsed.memberName };
    if (t === "member_category_breakdown" && parsed.memberName) return { type: "member_category_breakdown", memberName: parsed.memberName };
    if (t === "member_leaderboard") {
      const metric = parsed.metric === "yes_rate" || parsed.metric === "vote_volume" ? parsed.metric : "dissent_rate";
      return { type: "member_leaderboard", metric };
    }
    if (t === "recent_meetings") return { type: "recent_meetings", limit: parsed.limit ?? 1 };
    if (t === "recent_votes") return { type: "recent_votes", limit: parsed.limit ?? 8 };
    if (t === "recent_non_unanimous") return { type: "recent_non_unanimous", limit: parsed.limit ?? 8 };
    if (t === "category_overview") return { type: "category_overview" };
    if (t === "category_count" && parsed.category) return { type: "category_count", category: parsed.category };
    if (t === "alignment_highlights") {
      const direction = parsed.direction === "most_split" ? "most_split" : "most_aligned";
      return { type: "alignment_highlights", direction };
    }
    if (t === "vote_search" && parsed.searchTerm) return { type: "vote_search", searchTerm: parsed.searchTerm, limit: parsed.limit ?? 8 };
    if (t === "property_transactions") return { type: "property_transactions", ...(parsed.actionType ? { actionType: parsed.actionType } : {}) };
    if (t === "personnel_actions") return { type: "personnel_actions", ...(parsed.actionType ? { actionType: parsed.actionType } : {}) };
    if (t === "executive_session") {
      const reasonFilter = parsed.searchTerm === "real estate" || parsed.searchTerm === "litigation" ? parsed.searchTerm : undefined;
      return { type: "executive_session", ...(reasonFilter ? { reasonFilter } : {}) };
    }
  } catch {
    // fall through
  }
  return { type: "faq" };
};

// ---------------------------------------------------------------------------
// Transcript context — safe summary for chat injection (no prayer data)
// ---------------------------------------------------------------------------

export const getTranscriptContextForChat = async (meetingId: number, meetingTitle?: string, meetingDate?: string): Promise<string | null> => {
  try {
    const transcript = await getTranscriptForMeeting(meetingId);
    if (!transcript) return null;

    const execCount = transcript.execSessionContext?.length ?? (transcript.execSessionDetected ? 1 : 0);
    const reasons = transcript.execSessionContext
      ?.flatMap((b) => b.reasons ?? [])
      .filter((r, i, arr) => arr.indexOf(r) === i)
      .slice(0, 4)
      .join(", ");
    const voiceVoteCount = transcript.voiceVotes?.length ?? 0;
    const motionCount = transcript.motionsDetected?.length ?? 0;

    const label = meetingTitle
      ? `${meetingTitle}${meetingDate ? ` (${meetingDate})` : ""}`
      : meetingDate ?? `Meeting #${meetingId}`;

    const lines: string[] = [`Transcript context for ${label}:`];
    if (execCount > 0) {
      lines.push(`- Executive sessions detected: ${execCount}${reasons ? ` (reasons: ${reasons})` : ""}`);
    } else {
      lines.push(`- No executive sessions detected in transcript`);
    }
    lines.push(`- Voice vote triggers: ${voiceVoteCount} detected`);
    lines.push(`- Motions detected: ${motionCount}`);
    lines.push(`- Source: YouTube video ${transcript.videoId}`);

    return lines.join("\n");
  } catch {
    return null;
  }
};

// ---------------------------------------------------------------------------
// Data fetching — returns raw results + default citations per intent
// ---------------------------------------------------------------------------

type FetchedData = { queryResults: unknown; citations: ChatCitation[] };

const fetchDataForIntent = async (intent: DataQueryIntent): Promise<FetchedData | null> => {
  switch (intent.type) {
    case "member_vote_stats": {
      const data = await getMemberVoteStats(intent.memberName);
      return data ? { queryResults: data, citations: [{ label: "Members", path: "/members" }, { label: "Votes", path: "/votes" }] } : null;
    }
    case "member_category_breakdown": {
      const data = await getMemberCategoryBreakdown(intent.memberName);
      return data.length > 0 ? { queryResults: data, citations: [{ label: "Members", path: "/members" }, { label: "Votes", path: "/votes" }] } : null;
    }
    case "member_leaderboard": {
      const data = await getMemberStats();
      return data.length > 0 ? { queryResults: { metric: intent.metric, members: data }, citations: [{ label: "Members", path: "/members" }] } : null;
    }
    case "recent_meetings": {
      const data = await getRecentMeetingSummaries(intent.limit);
      return data.length > 0 ? { queryResults: data, citations: [{ label: "Meetings", path: "/meetings" }, { label: "Votes", path: "/votes" }] } : null;
    }
    case "recent_votes": {
      const data = await getRecentVoteSummaries(intent.limit);
      return data.length > 0 ? { queryResults: data, citations: [{ label: "Votes", path: "/votes" }, { label: "Meetings", path: "/meetings" }] } : null;
    }
    case "recent_non_unanimous": {
      const data = await getRecentNonUnanimousVotes(intent.limit);
      return { queryResults: data, citations: [{ label: "Votes", path: "/votes" }] };
    }
    case "category_overview": {
      const data = await getCategoryStats();
      return data.length > 0 ? { queryResults: data, citations: [{ label: "Votes", path: "/votes" }] } : null;
    }
    case "category_count": {
      const data = await getCategoryCount(intent.category);
      return data ? { queryResults: data, citations: [{ label: "Votes", path: "/votes" }] } : null;
    }
    case "alignment_highlights": {
      const data = await getPairwiseAlignment();
      return data.length > 0 ? { queryResults: { direction: intent.direction, pairs: data }, citations: [{ label: "Voting Alignment", path: "/alliances" }] } : null;
    }
    case "vote_search": {
      const data = await searchVoteItemsForChat(intent.searchTerm, intent.limit);
      return { queryResults: { searchTerm: intent.searchTerm, results: data }, citations: [{ label: "Votes", path: "/votes" }] };
    }
    case "property_transactions": {
      const data = await getPropertyTransactions(intent.actionType);
      return { queryResults: data, citations: [{ label: "Votes", path: "/votes" }] };
    }
    case "personnel_actions": {
      const data = await getPersonnelActions(intent.actionType);
      return { queryResults: data, citations: [{ label: "Votes", path: "/votes" }, { label: "Members", path: "/members" }] };
    }
    case "executive_session": {
      const data = await getExecutiveSessionSummaries(intent.reasonFilter);
      return { queryResults: data, citations: [{ label: "Votes", path: "/votes" }, { label: "Meetings", path: "/meetings" }] };
    }
    case "faq":
      return null;
  }
};

// Deterministic fallback formatters — used when no API key is available

const voteSummaryLabel = (vote: ChatVoteSummary) => {
  const title = vote.displayText !== "Needs review" ? vote.displayText : vote.itemTitle;
  return `${vote.meetingDate || "unknown date"}: ${title}`;
};

const formatVoteSummaryList = (votes: ChatVoteSummary[], maxItems = 3) =>
  votes.slice(0, maxItems).map((vote) => {
    const split = vote.noOrAbstainVoters.length > 0 ? ` Split voters: ${vote.noOrAbstainVoters.join(", ")}.` : "";
    return `${voteSummaryLabel(vote)} (${vote.category}).${split}`;
  }).join(" ");

const formatMeetingSummary = (meeting: ChatMeetingSummary) => {
  const topCategories = meeting.categories.slice(0, 3).map((e) => `${e.category} (${e.count})`).join(", ");
  const splitText = meeting.nonUnanimousCount > 0 ? `${meeting.nonUnanimousCount} were non-unanimous` : "none marked non-unanimous";
  const notable = formatVoteSummaryList(meeting.notableVotes, 2);
  return `${meeting.meetingTitle} on ${meeting.meetingDate}: ${formatCount(meeting.voteItemCount, "vote item")}; ${splitText}. Top topics: ${topCategories || "not categorized"}.${notable ? ` Notable items: ${notable}` : ""}`;
};

const buildDeterministicFallback = async (intent: DataQueryIntent): Promise<string | null> => {
  switch (intent.type) {
    case "member_vote_stats": {
      const s = await getMemberVoteStats(intent.memberName);
      if (!s || s.total === 0) return null;
      return `${s.name}: ${formatCount(s.total, "recorded vote")} — ${s.yes} yes, ${s.no} no, ${s.abstain} abstain, ${s.recused} recused, ${s.absent} absent. Dissent rate: ${formatPercent(s.dissentRate)}.`;
    }
    case "member_category_breakdown": {
      const rows = await getMemberCategoryBreakdown(intent.memberName);
      if (rows.length === 0) return null;
      const top = rows.slice(0, 4).map((r) => `${r.category}: ${r.total} votes, ${r.no} no, ${r.abstain} abstain`).join("; ");
      return `${intent.memberName}'s top vote categories: ${top}.`;
    }
    case "member_leaderboard": {
      const members = await getMemberStats();
      if (members.length === 0) return null;
      const sorted = [...members].sort((a, b) =>
        intent.metric === "dissent_rate" ? b.dissentRate - a.dissentRate
          : intent.metric === "yes_rate" ? (b.yesCount / Math.max(b.totalVotes, 1)) - (a.yesCount / Math.max(a.totalVotes, 1))
          : b.totalVotes - a.totalVotes,
      );
      const top = sorted[0];
      if (!top) return null;
      return intent.metric === "dissent_rate"
        ? `Highest dissent rate: ${top.name} at ${formatPercent(top.dissentRate)} (${top.dissentCount}/${top.totalVotes} votes).`
        : intent.metric === "yes_rate"
          ? `Highest yes rate: ${top.name} at ${formatPercent(top.yesCount / Math.max(top.totalVotes, 1))}.`
          : `Most recorded votes: ${top.name} with ${top.totalVotes}.`;
    }
    case "recent_meetings": {
      const meetings = await getRecentMeetingSummaries(intent.limit);
      return meetings.length > 0 ? meetings.map(formatMeetingSummary).join(" ") : null;
    }
    case "recent_votes": {
      const votes = await getRecentVoteSummaries(intent.limit);
      return votes.length > 0 ? `Recent vote items: ${formatVoteSummaryList(votes, 5)}` : null;
    }
    case "recent_non_unanimous": {
      const votes = await getRecentNonUnanimousVotes(intent.limit);
      if (votes.length === 0) return "No recent non-unanimous votes found in the extracted data.";
      return `${formatCount(votes.length, "recent non-unanimous item")}: ${votes.slice(0, 5).map((v) => `${v.meetingDate}: ${v.itemTitle}`).join("; ")}.`;
    }
    case "category_overview": {
      const rows = await getCategoryStats();
      if (rows.length === 0) return null;
      return `Top vote categories: ${rows.slice(0, 5).map((r) => `${r.category} (${r.totalVotes})`).join(", ")}.`;
    }
    case "category_count": {
      const row = await getCategoryCount(intent.category);
      return row ? `${row.category}: ${formatCount(row.total, "vote item")}, including ${formatCount(row.nonUnanimous, "non-unanimous item")}.` : null;
    }
    case "alignment_highlights": {
      const pairs = (await getPairwiseAlignment()).filter((p) => p.overlap > 0);
      const sorted = pairs.sort((a, b) =>
        intent.direction === "most_aligned" ? b.alignmentRate - a.alignmentRate : b.splitRate - a.splitRate,
      );
      const top = sorted.slice(0, 3);
      return top.length > 0
        ? `${intent.direction === "most_aligned" ? "Most aligned" : "Most split"}: ${top.map((p) => `${p.memberAName} & ${p.memberBName} (${formatPercent(intent.direction === "most_aligned" ? p.alignmentRate : p.splitRate)}, ${p.overlap} shared votes)`).join("; ")}.`
        : null;
    }
    case "vote_search": {
      const votes = await searchVoteItemsForChat(intent.searchTerm, intent.limit);
      return votes.length > 0
        ? `${formatCount(votes.length, "match")} for "${intent.searchTerm}": ${formatVoteSummaryList(votes, 5)}`
        : `No matches for "${intent.searchTerm}" in the extracted data.`;
    }
    case "property_transactions": {
      const rows = await getPropertyTransactions(intent.actionType);
      if (rows.length === 0) return "No matching property transactions found.";
      return `${formatCount(rows.length, "property action")}: ${rows.slice(0, 3).map((r) => `${r.meetingDate}: ${r.actionType}${r.location ? ` at ${r.location}` : ""}${r.party ? ` with ${r.party}` : ""}`).join("; ")}.`;
    }
    case "personnel_actions": {
      const rows = await getPersonnelActions(intent.actionType);
      if (rows.length === 0) return "No matching personnel actions found.";
      return `${formatCount(rows.length, "personnel action")}: ${rows.slice(0, 3).map((r) => `${r.meetingDate}: ${r.personName}, ${r.actionType}${r.position ? `, ${r.position}` : ""}`).join("; ")}.`;
    }
    case "executive_session": {
      const rows = await getExecutiveSessionSummaries(intent.reasonFilter);
      if (rows.length === 0) return "No matching executive sessions found in the extracted data.";
      const shown = rows.slice(0, 5).map((r) => `${r.meetingDate}: ${r.reason}`).join("; ");
      return `${formatCount(rows.length, "executive session")} found: ${shown}. See the Votes or Meetings pages for the source-linked records.`;
    }
    case "faq":
      return null;
  }
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
  const trimmed = question.trim();

  if (!trimmed) {
    return { answer: FALLBACK_ANSWER, citations: [], suggestions, scope: "fallback", modelUsed: "approved-faq" };
  }
  if (trimmed.length > MAX_QUESTION_LENGTH) {
    return { answer: "Please ask a shorter question.", citations: [], suggestions, scope: "refused", modelUsed: "approved-faq" };
  }

  // 1. Hard refusals — never hit the LLM
  const refused = checkHardRefusal(trimmed);
  if (refused) return refused;

  const approvedFaq = checkApprovedFaq(trimmed);
  if (approvedFaq) return approvedFaq;

  // 2. Classify intent locally
  let intent = classifyIntentLocally(trimmed);

  // 3. If local classifier says faq, try LLM classifier
  if (intent.type === "faq" && useModel) {
    intent = await classifyIntent(trimmed);
  }

  // 4. Fetch data for the intent (if data-driven)
  let fetched: FetchedData | null = null;
  if (intent.type !== "faq") {
    fetched = await fetchDataForIntent(intent);
  }

  // 5. Generate natural conversational answer via LLM
  // For meeting-specific intents, enrich with safe transcript context
  let transcriptContext: string | null = null;
  if (useModel && fetched?.queryResults) {
    if (intent.type === "recent_meetings") {
      const meetings = fetched.queryResults as ChatMeetingSummary[];
      const first = meetings[0];
      if (first?.meetingId) {
        transcriptContext = await getTranscriptContextForChat(
          first.meetingId,
          first.meetingTitle,
          first.meetingDate ?? undefined,
        );
      }
    }
  }

  if (useModel && intent.type !== "executive_session") {
    const rawAnswer = await generateChatAnswer(
      trimmed,
      fetched?.queryResults ?? null,
      context,
      previousQuestion || undefined,
      previousAssistantAnswer || undefined,
      transcriptContext,
    );
    if (rawAnswer) {
      const answer = sanitizeChatAnswer(rawAnswer);
      if (answer !== FALLBACK_ANSWER) {
        return {
          answer,
          citations: fetched?.citations ?? [{ label: "Votes", path: "/votes" }, { label: "Members", path: "/members" }],
          suggestions,
          scope: "answered",
          modelUsed: "gpt-4o-mini",
        };
      }
    }
  }

  // 6. Deterministic fallback (no API key or LLM failed)
  if (intent.type !== "faq") {
    const deterministicAnswer = await buildDeterministicFallback(intent);
    if (deterministicAnswer) {
      return {
        answer: deterministicAnswer,
        citations: fetched?.citations ?? [{ label: "Votes", path: "/votes" }],
        suggestions,
        scope: "answered",
        modelUsed: "site-data",
      };
    }
  }

  // 7. Hard fallback
  return {
    answer: "I couldn't find that in BoardVotes.io data. Try asking about a member, a topic, recent meetings, split votes, property actions, or search for a keyword.",
    citations: [{ label: "Votes", path: "/votes" }, { label: "Members", path: "/members" }, { label: "Meetings", path: "/meetings" }],
    suggestions,
    scope: "fallback",
    modelUsed: useModel && !process.env.OPENROUTER_API_KEY ? "setup-required" : "approved-faq",
  };
};
