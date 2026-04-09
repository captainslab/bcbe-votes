import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { Express } from "express";
import { config } from "../config/env";

export const applySecurity = (app: Express) => {
  app.use(
    helmet({
      contentSecurityPolicy: false, // adjust if CSP is configured later
    }),
  );

  app.use(
    cors({
      origin: config.corsOrigin,
      methods: ["GET", "POST", "OPTIONS"],
    }),
  );

  app.use(
    rateLimit({
      windowMs: config.rateLimit.windowMs,
      max: config.rateLimit.max,
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );

  app.use(
    (req, res, next) => {
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("X-Frame-Options", "SAMEORIGIN");
      res.setHeader("Referrer-Policy", "no-referrer-when-downgrade");
      next();
    },
  );
};
