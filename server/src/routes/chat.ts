// @ts-nocheck
import { Router } from "express";
import { answerBoardVotesQuestion, buildChatContext } from "../services/chatService";

export const chatRouter = Router();

const makeContext = () =>
  buildChatContext({
    totalMeetings: 0,
    totalVotes: 0,
    totalVoteRecords: 0,
  });

const getQuestion = (req: any): string => {
  const body = req.body ?? {};
  return String(
    body.question ??
      body.message ??
      body.prompt ??
      body.q ??
      ""
  ).trim();
};

chatRouter.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "boardvotes-chatbot",
    timestamp: new Date().toISOString(),
  });
});

chatRouter.post("/", async (req, res, next) => {
  try {
    const question = getQuestion(req);

    if (!question) {
      return res.status(400).json({
        error: "Question is required",
      });
    }

    const result = await answerBoardVotesQuestion({
      question,
      context: makeContext(),
      useModel: Boolean(process.env.OPENROUTER_API_KEY),
    });

    return res.json({
      ...result,
      message: result?.answer ?? result?.message ?? "",
    });
  } catch (err) {
    return next(err);
  }
});

chatRouter.post("/message", async (req, res, next) => {
  try {
    const question = getQuestion(req);

    if (!question) {
      return res.status(400).json({
        error: "Question is required",
      });
    }

    const result = await answerBoardVotesQuestion({
      question,
      context: makeContext(),
      useModel: Boolean(process.env.OPENROUTER_API_KEY),
    });

    return res.json({
      ...result,
      message: result?.answer ?? result?.message ?? "",
    });
  } catch (err) {
    return next(err);
  }
});
