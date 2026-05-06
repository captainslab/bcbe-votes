import { getSummaryStats } from "./analyticsService";

export type ChatContext = {
  totalMeetings: number;
  totalVotes: number;
  totalVoteRecords: number;
  needsReviewCount?: number;
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
  modelUsed: "approved-faq" | "gpt-5-nano" | "setup-required";
};

type AnswerInput = {
  question: string;
  context: ChatContext;
  useModel?: boolean;
};

type RateLimitBucket = {
  windowStart: number;
  count: number;
};

const FALLBACK_ANSWER = "I don’t know from BoardVotes.io data.";
const MOTIVE_ANSWER = "BoardVotes.io records vote outcomes, but it does not provide reasons unless the public source states them.";
const MAX_QUESTION_LENGTH = 500;
const CHAT_RATE_LIMIT_WINDOW_MS = 60_000;
const CHAT_RATE_LIMIT_MAX = 12;
const OPENROUTER_MODEL = "openai/gpt-5-nano";
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
  if (typeof context.needsReviewCount === "number") {
    chatContext.needsReviewCount = context.needsReviewCount;
  }
  return chatContext;
};

export const buildCurrentChatContext = async (): Promise<ChatContext> => {
  const summary = await getSummaryStats();
  return buildChatContext(summary);
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

const faqAnswer = (question: string, context: ChatContext): ChatResponse | null => {
  const q = normalizeQuestion(question);

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
      "The site includes historical 2020–2023 Regular Board Meeting data, plus newer records where available. Coverage may vary by meeting type and source quality.",
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

  if (/\b(voting alignment|alignment|alliances|voted together|voted similarly)\b/.test(q)) {
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
- Coverage: The site includes historical 2020–2023 Regular Board Meeting data, plus newer records where available. Coverage may vary by meeting type and source quality.
- Current public counts: ${context.totalMeetings} meetings, ${context.totalVotes} vote items, ${context.totalVoteRecords} extracted vote records.
- Verified means the site has strong source evidence for displayed vote information. It does not mean every public source is perfect.
- Needs Review means source evidence or parsing confidence is not strong enough yet.
- Non-unanimous means at least one recorded vote differed from the others.
- Some vote items have no individual records because the public source may report only the outcome or extraction may not identify individual votes.
- Voting Alignment shows how often board members voted similarly or differently across recorded vote items. It is not proof of motives, coordination, or personal alliances.
- Correction reports should include meeting date, item title, what looks wrong, and source context when available.`;

const callOpenRouter = async (question: string, approvedAnswer: string, context: ChatContext): Promise<string | null> => {
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
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [
          { role: "system", content: buildApprovedContextPrompt(context) },
          {
            role: "user",
            content: `Visitor question: ${question}\n\nApproved answer to preserve exactly in meaning and scope: ${approvedAnswer}\n\nReturn one short visitor-facing answer. Do not add facts, names, counts, reasons, or claims beyond the approved answer.`,
          },
        ],
        max_completion_tokens: 220,
        reasoning: { effort: "minimal" },
      }),
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

export const answerBoardVotesQuestion = async ({ question, context, useModel = false }: AnswerInput): Promise<ChatResponse> => {
  const trimmedQuestion = question.trim();
  if (!trimmedQuestion) {
    return baseResponse(FALLBACK_ANSWER, "fallback");
  }

  if (trimmedQuestion.length > MAX_QUESTION_LENGTH) {
    return baseResponse("Please ask a shorter question about BoardVotes.io.", "refused");
  }

  const deterministic = faqAnswer(trimmedQuestion, context);
  if (deterministic) {
    if (useModel && deterministic.scope === "answered") {
      const modelAnswer = await callOpenRouter(trimmedQuestion, deterministic.answer, context);
      if (modelAnswer) {
        const answer = sanitizeChatAnswer(modelAnswer);
        if (answer !== FALLBACK_ANSWER) {
          return {
            ...deterministic,
            answer,
            modelUsed: "gpt-5-nano",
          };
        }
      }
    }
    return deterministic;
  }

  return {
    answer: `${FALLBACK_ANSWER} Try the Votes page and filter/search the recorded vote items.`,
    citations: [{ label: "Votes", path: "/votes" }],
    suggestions,
    scope: "fallback",
    modelUsed: useModel && !process.env.OPENROUTER_API_KEY ? "setup-required" : "approved-faq",
  };
};
