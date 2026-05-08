import { getCategoryStats, getSummaryStats } from "./analyticsService";
import {
  canonicalBoardMembers,
  getCategoryCount,
  getMemberCategoryBreakdown,
  getMemberVoteStats,
  getPersonnelActions,
  getPropertyTransactions,
  getRecentNonUnanimousVotes,
} from "./dataService";

export type ChatContext = {
  totalMeetings: number;
  totalVotes: number;
  totalVoteRecords: number;
  needsReviewCount?: number;
  topCategory?: string;
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
  modelUsed: "approved-faq" | "gpt-4o-mini" | "setup-required";
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
  | { type: "recent_non_unanimous"; limit: number }
  | { type: "category_count"; category: string }
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
  "What years are covered?",
  "What does Needs Review mean?",
  "How do I find a vote?",
  "What does Voting Alignment mean?",
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
  if (typeof context.needsReviewCount === "number") chatContext.needsReviewCount = context.needsReviewCount;
  if (typeof context.topCategory === "string") chatContext.topCategory = context.topCategory;
  return chatContext;
};

export const buildCurrentChatContext = async (): Promise<ChatContext> => {
  const [summary, categoryStats] = await Promise.all([getSummaryStats(), getCategoryStats()]);
  const topCategory = categoryStats[0]?.category;
  return buildChatContext({ ...summary, ...(topCategory ? { topCategory } : {}) });
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

const baseResponse = (answer: string, scope: ChatResponse["scope"], citations: ChatCitation[] = []): ChatResponse => ({
  answer: sanitizeChatAnswer(answer),
  citations,
  suggestions,
  scope,
  modelUsed: "approved-faq",
});

const isVotingAlignmentContext = (value: string) => /\b(voting alignment|alignment|alliances|voted together|voted similarly|voted differently)\b/.test(normalizeQuestion(value));

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

  if (/\b(why did|reason|motive|motivation|intent|agenda)\b/.test(q)) {
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

  if (/\b(non unanimous|nonunanimous|not unanimous|split vote)\b/.test(q)) {
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

  if (/\b(find a board member|find member|board member|members page)\b/.test(q)) {
    return baseResponse(
      "Use the Members page to browse canonical public board member statistics. Member detail pages show extracted vote totals, dissent counts, and sourced profile details where available.",
      "answered",
      [{ label: "Members", path: "/members" }],
    );
  }

  if (/\b(find a vote|find vote|vote page|votes page|search votes)\b/.test(q)) {
    return baseResponse(
      "Use the Votes page to review extracted vote items. Open a vote detail page to see the meeting, source status, category, motion text when available, and individual records when extracted.",
      "answered",
      [{ label: "Votes", path: "/votes" }],
    );
  }

  if (/\b(voting alignment|alignment|alliances|voted together|voted similarly)\b/.test(q) && !/\bcategory alignment\b/.test(q)) {
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

  if (/\b(personnel category|personnel vote|what is personnel|what does personnel)\b/.test(q)) {
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
    return baseResponse(
      `Based on extracted vote records, ${topCat} is the most common vote-topic category on BoardVotes.io. Use the Votes page and filter by category to explore vote items in any topic area.`,
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

const callOpenRouterFreeform = async (question: string, context: ChatContext): Promise<string | null> =>
  postToOpenRouter([
    { role: "system", content: buildApprovedContextPrompt(context) },
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
- recent_non_unanimous: question about recent split votes, disagreements, or non-unanimous votes
- category_count: question about how many votes are in a category (personnel, budget, contracts, etc.)
- property_transactions: question about property purchases, sales, leases, or real estate actions
- personnel_actions: question about hiring, retirements, appointments, resignations
- faq: anything else (site navigation, definitions, general questions)

Board members: ${canonicalBoardMembers.join(", ")}

Return exactly this JSON shape:
{
  "type": "<intent>",
  "memberName": "<canonical name or null>",
  "category": "<category string or null>",
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
    if (t === "recent_non_unanimous") {
      return { type: "recent_non_unanimous", limit: parsed.limit ?? 8 };
    }
    if (t === "category_count" && parsed.category) {
      return { type: "category_count", category: parsed.category };
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

const DATA_ANALYST_SYSTEM_PROMPT = `You are the BoardVotes.io data assistant. Answer strictly from the query results provided.
Rules:
- Present numbers accurately from the data.
- Keep answers concise — 1 to 3 sentences maximum.
- Add appropriate caveats: note that data comes from extracted records and may not be complete.
- Never invent member names, vote counts, or outcomes not present in the data.
- Never speculate about motives, endorsements, or political advice.
- Do not use honorific title prefixes (Mr., Mrs., Ms., Dr.).
- If the data is empty, say you found no matching records in the extracted data.`;

const generateDataAnswer = async (question: string, queryResults: unknown): Promise<string | null> => {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;

  const resultsJson = JSON.stringify(queryResults, null, 2).slice(0, 3000);

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
          { role: "system", content: DATA_ANALYST_SYSTEM_PROMPT },
          {
            role: "user",
            content: `Question: ${question}\n\nQuery results:\n${resultsJson}\n\nAnswer the question based only on these results.`,
          },
        ],
        max_completion_tokens: 300,
        temperature: 0,
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

const answerDataQuestion = async (question: string, intent: DataQueryIntent): Promise<DataAnswerResult | null> => {
  if (intent.type === "faq") return null;

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
    case "recent_non_unanimous": {
      queryResults = await getRecentNonUnanimousVotes(intent.limit);
      citations = [{ label: "Votes", path: "/votes" }];
      break;
    }
    case "category_count": {
      queryResults = await getCategoryCount(intent.category);
      citations = [{ label: "Votes", path: "/votes" }];
      break;
    }
    case "property_transactions": {
      queryResults = await getPropertyTransactions(intent.actionType);
      citations = [{ label: "Votes", path: "/votes" }, { label: "Meetings", path: "/meetings" }];
      break;
    }
    case "personnel_actions": {
      queryResults = await getPersonnelActions(intent.actionType);
      citations = [{ label: "Votes", path: "/votes" }, { label: "Members", path: "/members" }];
      break;
    }
  }

  const rawAnswer = await generateDataAnswer(question, queryResults);
  if (!rawAnswer) return null;

  const answer = sanitizeChatAnswer(rawAnswer);
  if (answer === FALLBACK_ANSWER) return null;

  return { answer, citations };
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

  // 2. If model is available, classify intent and attempt a data query or freeform answer
  if (useModel) {
    const intent = await classifyIntent(trimmedQuestion);

    if (intent.type !== "faq") {
      const dataResult = await answerDataQuestion(trimmedQuestion, intent);
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

  // 3. Hard fallback
  return {
    answer: "I couldn't find a specific answer for that. Try the Votes page to search vote items, or the Members page for board member statistics.",
    citations: [{ label: "Votes", path: "/votes" }, { label: "Members", path: "/members" }],
    suggestions,
    scope: "fallback",
    modelUsed: useModel && !process.env.OPENROUTER_API_KEY ? "setup-required" : "approved-faq",
  };
};
