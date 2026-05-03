import { Router } from "express";
import { z } from "zod";
import {
  listMeetings,
  getMeeting,
  listVotes,
  getVote,
  listMembers,
  getMember,
  getMemberNoVoteItems,
} from "../services/dataService";
import {
  getMemberAlignment,
  getMemberStats,
  getPairwiseAlignment,
  getRecentVotes,
  getSummaryStats,
} from "../services/analyticsService";
import { validateRequest } from "../middleware/validateRequest";
import { HttpError } from "../utils/httpError";

const router = Router();

router.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

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
        limit: z.coerce.number().min(1).max(200).optional(),
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
      const member = await getMember(memberId);
      if (!member) throw new HttpError(404, "Member not found");
      const stats = (await getMemberStats()).find((s) => s.memberId === memberId);
      const noVoteItems = await getMemberNoVoteItems(memberId);
      res.json({ ...member, stats, noVoteItems });
    } catch (err) {
      next(err);
    }
  },
);

router.get("/stats", async (_req, res, next) => {
  try {
    const summary = await getSummaryStats();
    const recentVotes = await getRecentVotes(8);
    res.json({ summary, recentVotes });
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

export default router;
