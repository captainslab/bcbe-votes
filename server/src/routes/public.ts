import { Router } from "express";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { districtRequests } from "../db/schema";
import {
  listMeetings,
  getMeeting,
  listVotes,
  getVote,
  listMembers,
  getMember,
  getMemberMotions,
  getMemberNoVoteItems,
} from "../services/dataService";
import {
  getCategoryStats,
  getMemberAlignment,
  getMemberCategoryStats,
  getMemberStats,
  getPairwiseAlignment,
  getRecentVotes,
  getSummaryStats,
} from "../services/analyticsService";
import { validateRequest } from "../middleware/validateRequest";
import { HttpError } from "../utils/httpError";
import {
  answerBoardVotesQuestion,
  buildCurrentChatContext,
  isChatRateLimited,
} from "../services/chatService";

const router = Router();

router.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

router.post(
  "/chat",
  validateRequest(
    z.object({
      body: z.object({
        question: z.string().trim().min(1).max(500),
        previousQuestion: z.string().trim().max(500).optional(),
        previousAssistantAnswer: z.string().trim().max(1000).optional(),
      }),
    }),
  ),
  async (req, res, next) => {
    try {
      const rateLimitKey = req.ip || req.socket.remoteAddress || "unknown";
      if (isChatRateLimited(rateLimitKey)) {
        res.status(429).json({
          answer: "Please wait a moment before asking another BoardVotes.io question.",
          citations: [],
          suggestions: [],
          scope: "refused",
          modelUsed: "approved-faq",
        });
        return;
      }

      const { body } = res.locals.validatedRequest as {
        body: { question: string; previousQuestion?: string; previousAssistantAnswer?: string };
      };
      const context = await buildCurrentChatContext();
      const chatInput = {
        question: body.question,
        context,
        useModel: Boolean(process.env.OPENROUTER_API_KEY),
        ...(body.previousQuestion ? { previousQuestion: body.previousQuestion } : {}),
        ...(body.previousAssistantAnswer ? { previousAssistantAnswer: body.previousAssistantAnswer } : {}),
      };
      const response = await answerBoardVotesQuestion(chatInput);
      res.json(response);
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  "/meetings",
  validateRequest(
    z.object({
      query: z.object({
        limit: z.coerce.number().min(1).max(200).optional(),
        offset: z.coerce.number().min(0).optional(),
      }),
    }),
  ),
  async (req, res, next) => {
    try {
      const { query } = res.locals.validatedRequest as {
        query?: { limit?: number; offset?: number };
      };
      const { limit = 200, offset = 0 } = query ?? {};
      const meetings = await listMeetings(limit, offset);
      res.json(meetings);
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  "/meetings/:id",
  validateRequest(
    z.object({
      params: z.object({ id: z.coerce.number() }),
    }),
  ),
  async (req, res, next) => {
    try {
      const { params } = res.locals.validatedRequest as { params: { id: number } };
      const meeting = await getMeeting(params.id);
      if (!meeting) throw new HttpError(404, "Meeting not found");
      res.json(meeting);
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  "/votes",
  validateRequest(
    z.object({
      query: z.object({
        limit: z.coerce.number().min(1).max(5000).optional(),
        offset: z.coerce.number().min(0).optional(),
        nonUnanimousOnly: z
          .enum(["true", "false"])
          .transform((v) => v === "true")
          .optional(),
      }),
    }),
  ),
  async (req, res, next) => {
    try {
      const { query } = res.locals.validatedRequest as {
        query?: {
          limit?: number;
          offset?: number;
          nonUnanimousOnly?: boolean;
        };
      };
      const { limit = 50, offset = 0, nonUnanimousOnly = true } = query ?? {};
      const votes = await listVotes(nonUnanimousOnly, limit, offset);
      res.json(votes);
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  "/votes/:id",
  validateRequest(
    z.object({
      params: z.object({ id: z.coerce.number() }),
    }),
  ),
  async (req, res, next) => {
    try {
      const { params } = res.locals.validatedRequest as { params: { id: number } };
      const vote = await getVote(params.id);
      if (!vote) throw new HttpError(404, "Vote not found");
      res.json(vote);
    } catch (err) {
      next(err);
    }
  },
);

router.get("/members", async (_req, res, next) => {
  try {
    const members = await getMemberStats();
    res.json(members);
  } catch (err) {
    next(err);
  }
});

router.get(
  "/members/:id",
  validateRequest(
    z.object({
      params: z.object({ id: z.coerce.number() }),
    }),
  ),
  async (req, res, next) => {
    try {
      const { params } = res.locals.validatedRequest as { params: { id: number } };
      const memberId = params.id;
      const [member, memberStatsList, noVoteItems, categoryStats, motions] = await Promise.all([
        getMember(memberId),
        getMemberStats(),
        getMemberNoVoteItems(memberId),
        getMemberCategoryStats(memberId),
        getMemberMotions(memberId),
      ]);
      if (!member) throw new HttpError(404, "Member not found");
      const stats = memberStatsList.find((s) => s.memberId === memberId);
      res.json({ ...member, stats, noVoteItems, categoryStats, motions });
    } catch (err) {
      next(err);
    }
  },
);

router.get("/stats", async (_req, res, next) => {
  try {
    const [summary, recentVotes, categoryStats] = await Promise.all([
      getSummaryStats(),
      getRecentVotes(8),
      getCategoryStats(),
    ]);
    res.json({ summary, recentVotes, categoryStats });
  } catch (err) {
    next(err);
  }
});

router.get(
  "/recentVotes",
  validateRequest(
    z.object({
      query: z.object({
        limit: z.coerce.number().min(1).max(200).optional(),
      }),
    }),
  ),
  async (_req, res, next) => {
    try {
      const { query } = res.locals.validatedRequest as {
        query?: { limit?: number };
      };
      const { limit = 8 } = query ?? {};
      const recentVotes = await getRecentVotes(limit);
      res.json(recentVotes);
    } catch (err) {
      next(err);
    }
  },
);

router.get("/alliances", async (_req, res, next) => {
  try {
    const alliances = await getPairwiseAlignment();
    res.json(alliances);
  } catch (err) {
    next(err);
  }
});


router.get(
  "/members/:id/alignment",
  validateRequest(
    z.object({
      params: z.object({ id: z.coerce.number() }),
    }),
  ),
  async (req, res, next) => {
    try {
      const { params } = res.locals.validatedRequest as { params: { id: number } };
      const memberId = params.id;
      const alignment = await getMemberAlignment(memberId);
      res.json(alignment);
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  "/district-requests",
  validateRequest(
    z.object({
      body: z.object({
        boardName: z.string().min(1).max(200),
        state: z.string().min(2).max(50),
        email: z.string().email(),
        type: z.enum(["resident", "operator"]),
        name: z.string().optional(),
        role: z.string().optional(),
      }),
    }),
  ),
  async (_req, res, next) => {
    try {
      const { body } = res.locals.validatedRequest as {
        body: {
          boardName: string;
          state: string;
          email: string;
          type: string;
          name?: string;
          role?: string;
        };
      };
      const [row] = await db
        .insert(districtRequests)
        .values({
          boardName: body.boardName,
          state: body.state,
          email: body.email,
          type: body.type,
          name: body.name ?? null,
          role: body.role ?? null,
        })
        .returning({ id: districtRequests.id });
      res.json({ success: true, id: row?.id });
    } catch (err: unknown) {
      // Unique constraint violation (same email + board): treat as success
      if (
        err instanceof Error &&
        "code" in err &&
        (err as NodeJS.ErrnoException & { code: string }).code === "23505"
      ) {
        res.json({ success: true, duplicate: true });
        return;
      }
      next(err);
    }
  },
);

router.get("/district-requests/counts", async (_req, res, next) => {
  try {
    const rows = await db.execute(
      sql`SELECT board_name, state, COUNT(*)::int AS count
          FROM district_requests
          GROUP BY board_name, state
          ORDER BY count DESC
          LIMIT 20`,
    );
    const result = (rows.rows as { board_name: string; state: string; count: number }[]).map(
      (r) => ({ boardName: r.board_name, state: r.state, count: r.count }),
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
