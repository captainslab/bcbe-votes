import fs from "fs";
import path from "path";
import { Request, Response, Router } from "express";
import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import Stripe from "stripe";
import { db } from "../db";
import { boardSubmissions, boardPledges, organizations } from "../db/schema";
import { validateRequest } from "../middleware/validateRequest";
import { HttpError } from "../utils/httpError";

// ---------------------------------------------------------------------------
// Email / log helpers
// ---------------------------------------------------------------------------
const PURCHASE_LOG = path.resolve("/home/jordan/bcbe-votes/logs/purchases.log");

function logPurchase(lines: string[]): void {
  const entry = `[${new Date().toISOString()}]\n${lines.join("\n")}\n\n`;
  try {
    fs.appendFileSync(PURCHASE_LOG, entry, "utf8");
  } catch (err) {
    console.error("[boards] Failed to write purchase log:", err);
  }
}

// TODO: configure SMTP_HOST, SMTP_USER, SMTP_PASS in .env to send real emails.
// Until then, emails are written to PURCHASE_LOG as a fallback.
async function sendEmail(opts: {
  to: string;
  subject: string;
  text: string;
}): Promise<void> {
  const smtpHost = process.env.SMTP_HOST;
  const sendgridKey = process.env.SENDGRID_API_KEY;

  if (smtpHost || sendgridKey) {
    // nodemailer path — wired when SMTP is configured
    const nodemailer = await import("nodemailer");
    const transport = nodemailer.createTransport(
      smtpHost
        ? {
            host: smtpHost,
            port: Number(process.env.SMTP_PORT ?? 587),
            auth: {
              user: process.env.SMTP_USER,
              pass: process.env.SMTP_PASS,
            },
          }
        : {
            host: "smtp.sendgrid.net",
            port: 587,
            auth: { user: "apikey", pass: sendgridKey },
          },
    );
    await transport.sendMail({
      from: process.env.SMTP_FROM ?? "noreply@boardvotes.io",
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
    });
  } else {
    // Fallback: write to log file
    logPurchase([`TO: ${opts.to}`, `SUBJECT: ${opts.subject}`, opts.text]);
  }
}

// NOTE: The webhook route must be registered with express.raw() BEFORE express.json()
// in app.ts. See webhookHandler export below and app.ts registration.
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "");

const router = Router();

// ---------------------------------------------------------------------------
// POST /boards/create-checkout
// Creates a Stripe Checkout session for the $25 submission fee
// ---------------------------------------------------------------------------
router.post(
  "/create-checkout",
  validateRequest(
    z.object({
      body: z.object({
        boardName: z.string().min(1).max(200),
        state: z.string().min(2).max(50),
        submitterName: z.string().min(1).max(100),
        submitterEmail: z.string().email(),
      }),
    }),
  ),
  async (_req, res, next) => {
    try {
      const { body } = res.locals.validatedRequest as {
        body: {
          boardName: string;
          state: string;
          submitterName: string;
          submitterEmail: string;
        };
      };

      const { boardName, state, submitterName, submitterEmail } = body;

      // Generate a slug: lowercase boardName + state, replace spaces/special chars
      // with hyphens, append 4 random alphanumeric chars for uniqueness
      const randomSuffix = Math.random().toString(36).slice(2, 6);
      const slugBase = `${boardName}-${state}`
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
      const slug = `${slugBase}-${randomSuffix}`;

      const corsOrigin = process.env.CORS_ORIGIN ?? "http://localhost:5173";

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "usd",
              unit_amount: 2500,
              product_data: {
                name: `BoardVotes Submission: ${boardName}`,
              },
            },
          },
        ],
        success_url: `${corsOrigin}/boards/${slug}?success=1`,
        cancel_url: `${corsOrigin}/request`,
        metadata: { boardName, state, submitterName, submitterEmail, slug },
      });

      res.json({ url: session.url });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /boards/webhook
// Stripe webhook — must be registered with express.raw() before express.json()
// ---------------------------------------------------------------------------
export const webhookHandler = async (req: Request, res: Response): Promise<void> => {
  const sig = req.headers["stripe-signature"];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  // Use ReturnType to avoid Stripe namespace access issues under CommonJS esModuleInterop
  type StripeEvent = ReturnType<typeof stripe.webhooks.constructEvent>;
  let event: StripeEvent;

  try {
    if (webhookSecret && sig) {
      event = stripe.webhooks.constructEvent(req.body as Buffer, sig, webhookSecret);
    } else {
      // Local dev: skip signature verification
      event = JSON.parse((req.body as Buffer).toString()) as StripeEvent;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Webhook error";
    res.status(400).json({ error: message });
    return;
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as { metadata?: Record<string, string> | null; payment_intent?: string | { id: string } | null };
    const meta = session.metadata ?? {};
    const { boardName, state, submitterName, submitterEmail, slug } = meta;

    if (boardName && state && submitterName && submitterEmail && slug) {
      try {
        await db.insert(boardSubmissions).values({
          boardName,
          state,
          submitterName,
          submitterEmail,
          slug,
          goalAmount: 500,
          pledgedAmount: 25,
          status: "active",
          stripePaymentIntentId: session.payment_intent as string | null,
        });

        // TODO: send alert email to help@boardvotes.io when a new board is submitted
        console.log(`[boards] New submission activated: ${boardName} (${state}) — slug: ${slug}`);
      } catch (err) {
        console.error("[boards] Failed to insert board submission from webhook:", err);
        res.status(500).json({ error: "DB insert failed" });
        return;
      }
    }
  }

  res.status(200).json({ received: true });
};

// ---------------------------------------------------------------------------
// GET /boards
// Returns all active/funded boards ordered by pledgedAmount desc
// ---------------------------------------------------------------------------
router.get("/", async (_req, res, next) => {
  try {
    const rows = await db.execute(sql`
      SELECT
        bs.id,
        bs.board_name AS "boardName",
        bs.state,
        bs.slug,
        bs.goal_amount AS "goalAmount",
        bs.pledged_amount AS "pledgedAmount",
        bs.status,
        bs.created_at AS "createdAt",
        COUNT(bp.id)::int AS "pledgeCount"
      FROM board_submissions bs
      LEFT JOIN board_pledges bp ON bp.board_submission_id = bs.id
      WHERE bs.status IN ('active', 'funded')
      GROUP BY bs.id
      ORDER BY bs.pledged_amount DESC
    `);

    res.json(rows.rows);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /boards/:slug
// Returns a single board with its pledges (no emails)
// ---------------------------------------------------------------------------
router.get(
  "/:slug",
  validateRequest(
    z.object({
      params: z.object({ slug: z.string().min(1) }),
    }),
  ),
  async (_req, res, next) => {
    try {
      const { params } = res.locals.validatedRequest as { params: { slug: string } };

      const [board] = await db
        .select()
        .from(boardSubmissions)
        .where(eq(boardSubmissions.slug, params.slug))
        .limit(1);

      if (!board) throw new HttpError(404, "Board not found");

      const pledges = await db
        .select({
          id: boardPledges.id,
          pledgerName: boardPledges.pledgerName,
          amount: boardPledges.amount,
          createdAt: boardPledges.createdAt,
        })
        .from(boardPledges)
        .where(eq(boardPledges.boardSubmissionId, board.id))
        .orderBy(boardPledges.createdAt);

      res.json({ ...board, pledges });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /boards/:slug/pledge
// Adds a pledge to a board submission
// ---------------------------------------------------------------------------
router.post(
  "/:slug/pledge",
  validateRequest(
    z.object({
      params: z.object({ slug: z.string().min(1) }),
      body: z.object({
        pledgerName: z.string().min(1).max(200),
        pledgerEmail: z.string().email(),
        amount: z.number().int().min(1).max(10000),
      }),
    }),
  ),
  async (_req, res, next) => {
    try {
      const { params, body } = res.locals.validatedRequest as {
        params: { slug: string };
        body: { pledgerName: string; pledgerEmail: string; amount: number };
      };

      const [board] = await db
        .select()
        .from(boardSubmissions)
        .where(eq(boardSubmissions.slug, params.slug))
        .limit(1);

      if (!board) throw new HttpError(404, "Board not found");

      try {
        await db.insert(boardPledges).values({
          boardSubmissionId: board.id,
          pledgerName: body.pledgerName,
          pledgerEmail: body.pledgerEmail,
          amount: body.amount,
        });
      } catch (err: unknown) {
        // Unique constraint violation — same email already pledged to this board
        if (
          err instanceof Error &&
          "code" in err &&
          (err as NodeJS.ErrnoException & { code: string }).code === "23505"
        ) {
          res.json({ success: true, funded: false, duplicate: true });
          return;
        }
        throw err;
      }

      // Update pledgedAmount on the submission
      const newPledgedAmount = board.pledgedAmount + body.amount;
      const nowFunded = newPledgedAmount >= board.goalAmount;

      await db
        .update(boardSubmissions)
        .set({
          pledgedAmount: newPledgedAmount,
          status: nowFunded ? "funded" : board.status,
          updatedAt: new Date(),
        })
        .where(eq(boardSubmissions.id, board.id));

      if (nowFunded) {
        console.log(`[boards] FUNDED: ${board.boardName} (${board.state})`);
      }

      res.json({ success: true, funded: nowFunded });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
