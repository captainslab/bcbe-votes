import { Router } from "express";
import Stripe from "stripe";
import { z } from "zod";
import { validateRequest } from "../middleware/validateRequest";
import { HttpError } from "../utils/httpError";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY ?? "";
const stripe = new Stripe(stripeSecretKey);

const getPublicOrigin = () => {
  const origin = process.env.CORS_ORIGIN ?? "http://localhost:5173";
  return origin.split(",")[0]?.trim() || "http://localhost:5173";
};

const router = Router();

type CheckoutSessionCreateParams = Parameters<typeof stripe.checkout.sessions.create>[0];

router.post(
  "/create-checkout",
  validateRequest(
    z.object({
      body: z.object({
        amount: z.number().int().min(1).max(10000),
        name: z.string().max(100).optional(),
        email: z.string().email().optional().or(z.literal("")),
      }),
    }),
  ),
  async (_req, res, next) => {
    try {
      if (!stripeSecretKey) {
        throw new HttpError(503, "Donations are unavailable right now");
      }

      const { body } = res.locals.validatedRequest as {
        body: { amount: number; name?: string; email?: string };
      };
      const publicOrigin = getPublicOrigin();
      const email = body.email?.trim() || undefined;
      const name = body.name?.trim() || undefined;

      const sessionParams: CheckoutSessionCreateParams = {
        mode: "payment",
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "usd",
              unit_amount: body.amount * 100,
              product_data: {
                name: "BoardVotes.io support tip",
                description: "One-time support for independent public records access.",
              },
            },
          },
        ],
        success_url: `${publicOrigin}/donate?success=1`,
        cancel_url: `${publicOrigin}/donate?canceled=1`,
        metadata: {
          type: "donation",
          amount: String(body.amount),
          ...(name ? { name } : {}),
        },
      };

      if (email) {
        sessionParams.customer_email = email;
      }

      const session = await stripe.checkout.sessions.create(sessionParams);

      res.json({ url: session.url });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
