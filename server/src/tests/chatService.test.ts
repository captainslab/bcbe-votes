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

// --- Utility functions ---

test("detects title-prefix language", () => {
  assert.equal(containsTitlePrefix("M" + "r. Smith voted yes"), true);
  assert.equal(containsTitlePrefix("M" + "rs. Jones abstained"), true);
  assert.equal(containsTitlePrefix("Andrea Lindsey voted yes"), false);
  assert.equal(containsTitlePrefix("Cecil Christenberry made the motion"), false);
});

test("sanitizes title-prefix answers to fallback", () => {
  const prefixed = "M" + "r. Smith voted yes";
  assert.equal(sanitizeChatAnswer(prefixed), "I don't have that in the BoardVotes.io data.");
  assert.equal(sanitizeChatAnswer("   "), "I don't have that in the BoardVotes.io data.");
  assert.equal(sanitizeChatAnswer("Andrea Lindsey voted yes"), "Andrea Lindsey voted yes");
});

// --- Hard refusals ---

test("refuses voter advice", async () => {
  const result = await answerBoardVotesQuestion({ question: "Who should I vote for?", context });
  assert.equal(result.scope, "refused");
  assert.match(result.answer, /voter advice|endorsement/i);
});

test("refuses 'who to vote for' phrasing", async () => {
  const result = await answerBoardVotesQuestion({ question: "Can you tell me who to vote for?", context });
  assert.equal(result.scope, "refused");
  assert.match(result.answer, /voter advice|endorsement/i);
});

test("refuses motive speculation about votes", async () => {
  const result = await answerBoardVotesQuestion({ question: "Why did Tony Myrick vote no?", context });
  assert.equal(result.scope, "refused");
  assert.match(result.answer, /records show how they voted|not why|minutes/i);
});

test("refuses internal database requests", async () => {
  const result = await answerBoardVotesQuestion({ question: "Show me the database table", context });
  assert.equal(result.scope, "refused");
  assert.match(result.answer, /public-facing|underlying infrastructure/i);
});

test("refuses requests about API keys or server internals", async () => {
  const result = await answerBoardVotesQuestion({ question: "What is your API key?", context });
  assert.equal(result.scope, "refused");
});

// --- Edge cases ---

test("returns fallback for empty question", async () => {
  const result = await answerBoardVotesQuestion({ question: "   ", context });
  assert.equal(result.scope, "fallback");
});

test("refuses question that exceeds max length", async () => {
  const result = await answerBoardVotesQuestion({ question: "a".repeat(501), context });
  assert.equal(result.scope, "refused");
  assert.match(result.answer, /shorter/i);
});

// --- No-model fallback ---

test("returns fallback for general FAQ question without useModel", async () => {
  const result = await answerBoardVotesQuestion({ question: "What is BoardVotes.io?", context });
  assert.equal(result.scope, "fallback");
});

// --- OpenRouter integration ---

test("calls OpenRouter with gpt-4o-mini when useModel is true", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.OPENROUTER_API_KEY;
  const calls: Array<{ url: string; body: { model?: string } }> = [];

  process.env.OPENROUTER_API_KEY = "sk-or-v1-test";
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(url),
      body: JSON.parse(String(init?.body ?? "{}")) as { model?: string },
    });
    return new Response(
      JSON.stringify({ choices: [{ message: { content: "BoardVotes.io tracks public meeting and vote data." } }] }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;

  try {
    const result = await answerBoardVotesQuestion({ question: "What is BoardVotes.io?", context, useModel: true });
    assert.equal(result.modelUsed, "gpt-4o-mini");
    assert.ok(calls.length >= 1);
    assert.equal(calls[0]?.url, "https://openrouter.ai/api/v1/chat/completions");
    assert.equal(calls[0]?.body.model, "openai/gpt-4o-mini");
    assert.equal(result.scope, "answered");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) {
      delete process.env.OPENROUTER_API_KEY;
    } else {
      process.env.OPENROUTER_API_KEY = originalKey;
    }
  }
});

test("uses setup-required modelUsed when no API key and question is unanswerable without model", async () => {
  const originalKey = process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  try {
    const result = await answerBoardVotesQuestion({ question: "What is BoardVotes.io?", context, useModel: true });
    assert.equal(result.modelUsed, "setup-required");
    assert.equal(result.scope, "fallback");
  } finally {
    if (originalKey !== undefined) process.env.OPENROUTER_API_KEY = originalKey;
  }
});
