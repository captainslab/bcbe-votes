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
const PURCHASE_LOG = path.resolve(process.env.PURCHASE_LOG_PATH ?? "./logs/purchases.log");

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

const boardCheckoutPackageIds = ["community_request", "founder_launch", "founder_full_history"] as const;
type BoardCheckoutPackageId = (typeof boardCheckoutPackageIds)[number];

const boardCheckoutPackages: Record<
  BoardCheckoutPackageId,
  {
    name: string;
    description: string;
    unitAmount: number;
    goalAmount: number;
    pledgedAmount: number;
    status: "active" | "funded";
  }
> = {
  community_request: {
    name: "Community Request",
    description: "Public board request page and community funding starter.",
    unitAmount: 2500,
    goalAmount: 500,
    pledgedAmount: 25,
    status: "active",
  },
  founder_launch: {
    name: "Founder Launch",
    description: "One-time BoardVotes launch package with a five-year archive.",
    unitAmount: 150000,
    goalAmount: 1500,
    pledgedAmount: 1500,
    status: "funded",
  },
  founder_full_history: {
    name: "Founder Launch + Full History",
    description: "One-time BoardVotes launch package with full available archive backfill.",
    unitAmount: 300000,
    goalAmount: 3000,
    pledgedAmount: 3000,
    status: "funded",
  },
};

const defaultBoardCheckoutPackageId: BoardCheckoutPackageId = "community_request";
const boardCheckoutPackageIdSchema = z.enum(boardCheckoutPackageIds);

const stripeSecretKey = process.env.STRIPE_SECRET_KEY ?? "";
const stripe = new Stripe(stripeSecretKey);
const stripeAutomaticTaxEnabled = process.env.STRIPE_AUTOMATIC_TAX === "true";
const stripeTaxBehavior = process.env.STRIPE_TAX_BEHAVIOR === "inclusive" ? "inclusive" : "exclusive";
const stripeTaxCode = process.env.STRIPE_TAX_CODE ?? "txcd_10000000";
type CheckoutSessionCreateParams = Parameters<typeof stripe.checkout.sessions.create>[0];
type CheckoutSession = Awaited<ReturnType<typeof stripe.checkout.sessions.create>>;

// NOTE: The webhook route must be registered with express.raw() BEFORE express.json()
// in app.ts. See webhookHandler export below and app.ts registration.
function ensureStripeConfigured(): void {
  if (!stripeSecretKey.startsWith("sk_")) {
    throw new HttpError(503, "Stripe checkout is not configured");
  }
}

function isStripeAuthenticationError(err: unknown): boolean {
  return (
    err !== null &&
    typeof err === "object" &&
    "type" in err &&
    (err as { type?: string }).type === "StripeAuthenticationError"
  );
}

function isStripeAutomaticTaxSetupError(err: unknown): boolean {
  if (err === null || typeof err !== "object") return false;
  const message = "message" in err ? String((err as { message?: string }).message ?? "") : "";
  return message.toLowerCase().includes("automatic tax") || message.toLowerCase().includes("head office address");
}

function isAllowedPublicOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    const isBoardVotesHost =
      url.hostname === "boardvotes.io" ||
      url.hostname === "www.boardvotes.io" ||
      url.hostname.endsWith(".boardvotes.io");
    const isLocalDev =
      (url.hostname === "localhost" || url.hostname === "127.0.0.1") &&
      (url.port === "5173" || url.port === "4173");
    return (url.protocol === "https:" && isBoardVotesHost) || (url.protocol === "http:" && isLocalDev);
  } catch {
    return false;
  }
}

function getPublicOrigin(req: Request): string {
  const origin = req.get("origin");
  if (origin && isAllowedPublicOrigin(origin)) return origin.replace(/\/$/, "");

  const forwardedProto = req.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost = req.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || req.get("host");
  const protocol = forwardedProto || req.protocol;
  if (host) {
    const candidate = `${protocol}://${host}`;
    if (isAllowedPublicOrigin(candidate)) return candidate.replace(/\/$/, "");
  }

  const configuredOrigin = (process.env.CORS_ORIGIN ?? "http://localhost:5173")
    .split(",")
    .map((value) => value.trim())
    .find(Boolean);
  return configuredOrigin ?? "http://localhost:5173";
}

function resolvePaymentIntentId(paymentIntent: string | { id: string } | null | undefined): string | null {
  if (!paymentIntent) return null;
  return typeof paymentIntent === "string" ? paymentIntent : paymentIntent.id;
}

function dollarsFromCents(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function parseMetadataInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

const router = Router();

// ---------------------------------------------------------------------------
// POST /boards/create-checkout
// Creates a Stripe Checkout session for board request/service packages
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
        packageId: boardCheckoutPackageIdSchema.default(defaultBoardCheckoutPackageId),
      }),
    }),
  ),
  async (req, res, next) => {
    try {
      ensureStripeConfigured();

      const { body } = res.locals.validatedRequest as {
        body: {
          boardName: string;
          state: string;
          submitterName: string;
          submitterEmail: string;
          packageId: BoardCheckoutPackageId;
        };
      };

      const { boardName, state, submitterName, submitterEmail } = body;
      const packageId = body.packageId ?? defaultBoardCheckoutPackageId;
      const selectedPackage = boardCheckoutPackages[packageId] ?? boardCheckoutPackages[defaultBoardCheckoutPackageId];

      // Generate a slug: lowercase boardName + state, replace spaces/special chars
      // with hyphens, append 4 random alphanumeric chars for uniqueness
      const randomSuffix = Math.random().toString(36).slice(2, 6);
      const slugBase = `${boardName}-${state}`
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
      const slug = `${slugBase}-${randomSuffix}`;

      const publicOrigin = getPublicOrigin(req);

      const buildSessionParams = (automaticTaxEnabled: boolean): CheckoutSessionCreateParams => ({
        mode: "payment",
        customer_email: submitterEmail,
        client_reference_id: slug,
        billing_address_collection: automaticTaxEnabled ? "required" : "auto",
        automatic_tax: { enabled: automaticTaxEnabled },
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "usd",
              unit_amount: selectedPackage.unitAmount,
              tax_behavior: stripeTaxBehavior,
              product_data: {
                name: `BoardVotes ${selectedPackage.name}: ${boardName}`,
                description: selectedPackage.description,
                tax_code: stripeTaxCode,
              },
            },
          },
        ],
        payment_intent_data: {
          receipt_email: submitterEmail,
        },
        success_url: `${publicOrigin}/request?success=1&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${publicOrigin}/request?canceled=1`,
        metadata: {
          boardName,
          state,
          submitterName,
          submitterEmail,
          slug,
          publicOrigin,
          packageId,
          packageName: selectedPackage.name,
          packageAmount: String(selectedPackage.unitAmount),
          goalAmount: String(selectedPackage.goalAmount),
          pledgedAmount: String(selectedPackage.pledgedAmount),
          status: selectedPackage.status,
          automaticTaxRequested: String(stripeAutomaticTaxEnabled),
          automaticTaxEnabled: String(automaticTaxEnabled),
          taxBehavior: stripeTaxBehavior,
          taxCode: stripeTaxCode,
        },
      });

      let session: CheckoutSession;
      try {
        session = await stripe.checkout.sessions.create(buildSessionParams(stripeAutomaticTaxEnabled));
      } catch (err) {
        if (stripeAutomaticTaxEnabled && isStripeAutomaticTaxSetupError(err)) {
          console.warn("[boards] Stripe automatic tax unavailable; retrying checkout without automatic tax. Configure Stripe Tax head office address in the Stripe dashboard.");
          session = await stripe.checkout.sessions.create(buildSessionParams(false));
        } else {
          throw err;
        }
      }

      res.json({ url: session.url });
    } catch (err) {
      if (isStripeAuthenticationError(err)) {
        next(new HttpError(503, "Stripe checkout is not configured"));
        return;
      }
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
    const packageId = boardCheckoutPackageIdSchema.safeParse(meta.packageId).success
      ? (meta.packageId as BoardCheckoutPackageId)
      : defaultBoardCheckoutPackageId;
    const selectedPackage = boardCheckoutPackages[packageId];
    const packageName = meta.packageName || selectedPackage.name;
    const packageAmount = parseMetadataInteger(meta.packageAmount, selectedPackage.unitAmount);
    const goalAmount = parseMetadataInteger(meta.goalAmount, selectedPackage.goalAmount);
    const pledgedAmount = parseMetadataInteger(meta.pledgedAmount, selectedPackage.pledgedAmount);
    const status = meta.status === "funded" ? "funded" : "active";
    const paymentIntentId = resolvePaymentIntentId(session.payment_intent);
    const publicOrigin = meta.publicOrigin && isAllowedPublicOrigin(meta.publicOrigin)
      ? meta.publicOrigin
      : (process.env.CORS_ORIGIN ?? "https://boardvotes.io").split(",")[0];

    if (boardName && state && submitterName && submitterEmail && slug) {
      try {
        const [existingSubmission] = await db
          .select({ id: boardSubmissions.id })
          .from(boardSubmissions)
          .where(eq(boardSubmissions.slug, slug))
          .limit(1);

        if (!existingSubmission) {
          await db.insert(boardSubmissions).values({
            boardName,
            state,
            submitterName,
            submitterEmail,
            slug,
            goalAmount,
            pledgedAmount,
            status,
            stripePaymentIntentId: paymentIntentId,
          });

          await sendEmail({
            to: submitterEmail,
            subject: `BoardVotes payment confirmed: ${packageName}`,
            text: [
              `Hi ${submitterName},`,
              "",
              `Payment confirmed for ${packageName} (${dollarsFromCents(packageAmount)}) for ${boardName}, ${state}.`,
              `Your BoardVotes page is: ${publicOrigin}/boards/${slug}`,
              "",
              "BoardVotes will follow up with next steps for source review and onboarding.",
            ].join("\n"),
          });

          await sendEmail({
            to: process.env.PURCHASE_ALERT_EMAIL ?? "help@boardvotes.io",
            subject: `BoardVotes payment received: ${packageName}`,
            text: [
              `Package: ${packageName}`,
              `Amount: ${dollarsFromCents(packageAmount)}`,
              `Board: ${boardName}`,
              `State: ${state}`,
              `Submitter: ${submitterName}`,
              `Email: ${submitterEmail}`,
              `Slug: ${slug}`,
              `Stripe payment intent: ${paymentIntentId ?? "unknown"}`,
            ].join("\n"),
          });

          console.log(`[boards] Payment confirmed: ${packageName} — ${boardName} (${state}) — slug: ${slug}`);
        }
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
// GET /boards/checkout-session/:sessionId
// Verifies a returned Stripe Checkout session without exposing secret data
// ---------------------------------------------------------------------------
router.get(
  "/checkout-session/:sessionId",
  validateRequest(
    z.object({
      params: z.object({
        sessionId: z.string().regex(/^cs_(test|live)_[A-Za-z0-9]+$/),
      }),
    }),
  ),
  async (_req, res, next) => {
    try {
      ensureStripeConfigured();

      const { params } = res.locals.validatedRequest as { params: { sessionId: string } };
      const session = await stripe.checkout.sessions.retrieve(params.sessionId);
      const metadata = session.metadata ?? {};
      const publicOrigin = metadata.publicOrigin && isAllowedPublicOrigin(metadata.publicOrigin)
        ? metadata.publicOrigin
        : (process.env.CORS_ORIGIN ?? "https://boardvotes.io").split(",")[0];

      res.json({
        id: session.id,
        status: session.status,
        paymentStatus: session.payment_status,
        amountTotal: session.amount_total,
        currency: session.currency,
        automaticTaxEnabled: session.automatic_tax?.enabled ?? false,
        customerEmail: session.customer_details?.email ?? session.customer_email ?? null,
        boardName: metadata.boardName ?? null,
        state: metadata.state ?? null,
        packageId: metadata.packageId ?? null,
        packageName: metadata.packageName ?? null,
        boardUrl: metadata.slug ? `${publicOrigin}/boards/${metadata.slug}` : null,
      });
    } catch (err) {
      if (isStripeAuthenticationError(err)) {
        next(new HttpError(503, "Stripe checkout is not configured"));
        return;
      }
      next(err);
    }
  },
);

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
