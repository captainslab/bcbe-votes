import { Router } from "express";
import { z } from "zod";
import { importMeetingById, importMeetingRange, reimportMeeting } from "../ingestion/workflow/importService";
import { validateRequest } from "../middleware/validateRequest";
import { adminAuth } from "../middleware/adminAuth";
import { db, schema } from "../db";
import { desc } from "drizzle-orm";

const router = Router();

router.use(adminAuth);

router.post(
  "/admin/batch-fetch",
  validateRequest(
    z.object({
      body: z
        .object({
          startMid: z.coerce.number().optional(),
          endMid: z.coerce.number().optional(),
        })
        .optional(),
    }),
  ),
  async (req, res, next) => {
    try {
      const body = req.body ?? {};
      const startMid = body.startMid ? Number(body.startMid) : undefined;
      const endMid = body.endMid ? Number(body.endMid) : undefined;
      const result = await importMeetingRange(startMid, endMid);
      res.json({ status: "ok", ...result });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  "/admin/reimport-meeting/:id",
  validateRequest(
    z.object({
      params: z.object({ id: z.coerce.number() }),
    }),
  ),
  async (req, res, next) => {
    try {
      const meetingId = Number(req.params.id);
      const meeting = await reimportMeeting(meetingId);
      res.json({ status: "ok", meeting });
    } catch (err) {
      next(err);
    }
  },
);

router.get("/admin/import-logs", async (_req, res, next) => {
  try {
    const logs = await db
      .select()
      .from(schema.importLogs)
      .orderBy(desc(schema.importLogs.startedAt))
      .limit(50);
    res.json(logs);
  } catch (err) {
    next(err);
  }
});

router.post(
  "/admin/import-meeting/:simbliId",
  validateRequest(
    z.object({
      params: z.object({ simbliId: z.string() }),
    }),
  ),
  async (req, res, next) => {
    try {
      const simbliId = String(req.params.simbliId);
      const meeting = await importMeetingById(simbliId);
      res.json({ status: "ok", meeting });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
