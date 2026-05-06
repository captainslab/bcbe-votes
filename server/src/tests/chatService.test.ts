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

  assert.match(result.answer, /historical 2020–2023 Regular Board Meeting data/);
  assert.match(result.answer, /newer records where available/);
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

  assert.equal(result.answer, "I don’t know from BoardVotes.io data. Try the Votes page and filter/search the recorded vote items.");
  assert.equal(result.scope, "fallback");
  assert.equal(result.modelUsed, "approved-faq");
});

test("detects and removes title-prefix language from chat output", () => {
  const blockedPrefixExample = "M" + "r. Smith voted yes";
  assert.equal(containsTitlePrefix(blockedPrefixExample), true);
  assert.equal(containsTitlePrefix("Andrea Lindsey voted yes"), false);
  assert.equal(sanitizeChatAnswer(blockedPrefixExample), "I don’t know from BoardVotes.io data.");
});
