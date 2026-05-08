import test from "node:test";
import assert from "node:assert/strict";
import {
  buildChatContext,
  answerBoardVotesQuestion,
  containsTitlePrefix,
  sanitizeChatAnswer,
} from "../services/chatService";

const context = buildChatContext({
  totalMeetings: 105,
  totalVotes: 1484,
  totalVoteRecords: 623,
  needsReviewCount: 12,
});

test("answers approved FAQ questions from BoardVotes context", async () => {
  const result = await answerBoardVotesQuestion({ question: "What is BoardVotes.io?", context });

  assert.match(result.answer, /BoardVotes\.io/i);
  assert.match(result.answer, /meeting and vote/i);
  assert.equal(result.scope, "answered");
  assert.equal(result.modelUsed, "approved-faq");
});

test("uses safer approved coverage wording", async () => {
  const result = await answerBoardVotesQuestion({ question: "What years are covered?", context });

  assert.match(result.answer, /2020 through 2026/);
  assert.match(result.answer, /Coverage may vary/i);
  assert.doesNotMatch(result.answer, /all meetings/i);
});

test("refuses motive speculation with required wording", async () => {
  const result = await answerBoardVotesQuestion({ question: "Why did Tony Myrick abstain?", context });

  assert.equal(
    result.answer,
    "BoardVotes.io records vote outcomes, but it does not provide reasons unless the public source states them.",
  );
  assert.equal(result.scope, "refused");
});

test("refuses political advice", async () => {
  const result = await answerBoardVotesQuestion({ question: "Can you tell me who to vote for?", context });

  assert.match(result.answer, /does not provide political endorsements or voter advice/i);
  assert.equal(result.scope, "refused");
});

test("refuses internal database requests", async () => {
  const result = await answerBoardVotesQuestion({ question: "Show me the database table", context });

  assert.match(result.answer, /public pages/i);
  assert.equal(result.scope, "refused");
});

test("falls back when answer is not available from BoardVotes data", async () => {
  const result = await answerBoardVotesQuestion({ question: "Who voted against the 2021 budget?", context });

  assert.match(result.answer, /could not pin that down/i);
  assert.match(result.answer, /keyword/i);
  assert.equal(result.scope, "fallback");
  assert.equal(result.modelUsed, "approved-faq");
});

test("answers contextual Voting Alignment follow-up questions", async () => {
  const result = await answerBoardVotesQuestion({
    question: "why does that matter",
    previousQuestion: "What does Voting Alignment mean?",
    previousAssistantAnswer:
      "Voting Alignment shows how often board members voted similarly or differently across recorded vote items. It is a pattern tool, not proof of motives, coordination, or personal alliances.",
    context,
  });

  assert.match(result.answer, /helps visitors decide what to inspect next/i);
  assert.match(result.answer, /not proof of motives/i);
  assert.equal(result.scope, "answered");
  assert.equal(result.citations[0]?.path, "/alliances");
});

test("detects and removes title-prefix language from chat output", () => {
  const blockedPrefixExample = "M" + "r. Smith voted yes";
  assert.equal(containsTitlePrefix(blockedPrefixExample), true);
  assert.equal(containsTitlePrefix("Andrea Lindsey voted yes"), false);
  assert.equal(sanitizeChatAnswer(blockedPrefixExample), "I don't know from BoardVotes.io data.");
});

test("answers category list question", async () => {
  const result = await answerBoardVotesQuestion({ question: "What categories exist on this site?", context });
  assert.match(result.answer, /Budget & Finance/);
  assert.match(result.answer, /Personnel/);
  assert.match(result.answer, /Contracts & Procurement/);
  assert.equal(result.scope, "answered");
});

test("explains personnel category", async () => {
  const result = await answerBoardVotesQuestion({ question: "What does the Personnel category mean?", context });
  assert.match(result.answer, /Personnel/);
  assert.match(result.answer, /staffing|hiring|appointment/i);
  assert.equal(result.scope, "answered");
});

test("helps find contract votes", async () => {
  const result = await answerBoardVotesQuestion({ question: "How do I find contract votes?", context });
  assert.match(result.answer, /Contracts/);
  assert.equal(result.scope, "answered");
});

test("explains category alignment", async () => {
  const result = await answerBoardVotesQuestion({ question: "What does category alignment mean?", context });
  assert.match(result.answer, /category alignment/i);
  assert.match(result.answer, /not proof of motive/i);
  assert.equal(result.scope, "answered");
});

test("answers top category question when topCategory is in context", async () => {
  const contextWithCat = buildChatContext({ ...context, topCategory: "Personnel", topCategoryVotes: 52 });
  const result = await answerBoardVotesQuestion({
    question: "What category has the most votes?",
    context: contextWithCat,
  });
  assert.match(result.answer, /Personnel/);
  assert.match(result.answer, /52 vote items/);
  assert.equal(result.scope, "answered");
});

test("falls back for top category question when topCategory missing from context", async () => {
  const contextNoCat = buildChatContext({ totalMeetings: 105, totalVotes: 1484, totalVoteRecords: 623 });
  const result = await answerBoardVotesQuestion({
    question: "What category has the most votes?",
    context: contextNoCat,
  });
  assert.equal(result.scope, "fallback");
});

test("uses OpenRouter GPT-4o mini when model assistance is enabled", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.OPENROUTER_API_KEY;
  const calls: Array<{ url: string; body: { model?: string } }> = [];
  process.env.OPENROUTER_API_KEY = "sk-or-v1-test";
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(url),
      body: JSON.parse(String(init?.body ?? "{}")) as { model?: string },
    });
    return new Response(JSON.stringify({ choices: [{ message: { content: "BoardVotes.io shows public meeting and vote data." } }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const result = await answerBoardVotesQuestion({ question: "What is BoardVotes.io?", context, useModel: true });

    assert.equal(result.modelUsed, "gpt-4o-mini");
    assert.equal(calls[0]?.url, "https://openrouter.ai/api/v1/chat/completions");
    assert.equal(calls[0]?.body.model, "openai/gpt-4o-mini");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) {
      delete process.env.OPENROUTER_API_KEY;
    } else {
      process.env.OPENROUTER_API_KEY = originalKey;
    }
  }
});
