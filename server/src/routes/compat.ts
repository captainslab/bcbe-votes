// @ts-nocheck
import { Router } from "express";

const apiBase = () => `http://127.0.0.1:${process.env.PORT || "4100"}/api`;

const queryFrom = (req: any) => {
  const idx = req.originalUrl.indexOf("?");
  return idx >= 0 ? req.originalUrl.slice(idx) : "";
};

const getJson = async (path: string) => {
  const response = await fetch(`${apiBase()}${path}`);
  const text = await response.text();

  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    const err: any = new Error(`Internal proxy failed: ${path}`);
    err.status = response.status;
    err.data = data;
    throw err;
  }

  return data;
};

export const boardCompatRouter = Router();
export const dashboardCompatRouter = Router();

const dashboardPayload = async () => {
  const [boards, members, votes, meetings] = await Promise.all([
    getJson("/boards"),
    getJson("/members"),
    getJson("/votes"),
    getJson("/meetings"),
  ]);

  const board =
    Array.isArray(boards) && boards.length
      ? boards.find((b: any) => b.slug === "bcbe") ?? boards[0]
      : null;

  return {
    board,
    boardSlug: "bcbe",
    totalBoards: Array.isArray(boards) ? boards.length : 0,
    totalMembers: Array.isArray(members) ? members.length : 0,
    totalVotes: Array.isArray(votes) ? votes.length : 0,
    totalMeetings: Array.isArray(meetings) ? meetings.length : 0,
    members,
    recentVotes: Array.isArray(votes) ? votes.slice(0, 10) : [],
    recentMeetings: Array.isArray(meetings) ? meetings.slice(0, 10) : [],
  };
};

boardCompatRouter.get("/", async (_req, res, next) => {
  try {
    const boards = await getJson("/boards");
    const board = Array.isArray(boards)
      ? boards.find((b: any) => b.slug === "bcbe")
      : null;

    if (!board) {
      return res.status(404).json({ error: "Board not found" });
    }

    return res.json(board);
  } catch (err) {
    return next(err);
  }
});

boardCompatRouter.get("/members", async (_req, res, next) => {
  try {
    return res.json(await getJson("/members"));
  } catch (err) {
    return next(err);
  }
});

boardCompatRouter.get("/votes", async (req, res, next) => {
  try {
    return res.json(await getJson(`/votes${queryFrom(req)}`));
  } catch (err) {
    return next(err);
  }
});

boardCompatRouter.get("/meetings", async (req, res, next) => {
  try {
    return res.json(await getJson(`/meetings${queryFrom(req)}`));
  } catch (err) {
    return next(err);
  }
});

boardCompatRouter.get("/dashboard", async (_req, res, next) => {
  try {
    return res.json(await dashboardPayload());
  } catch (err) {
    return next(err);
  }
});

dashboardCompatRouter.get("/", async (_req, res, next) => {
  try {
    return res.json(await dashboardPayload());
  } catch (err) {
    return next(err);
  }
});
