import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { Express } from "express";
import { config } from "../config/env";

const configuredCorsOrigins = config.corsOrigin
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const isAllowedDevOrigin = (origin: string) => {
  if (config.env !== "development") return false;

  try {
    const url = new URL(origin);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      (url.port === "5173" || url.port === "4173")
    );
  } catch {
    return false;
  }
};

export const applySecurity = (app: Express) => {
  app.use(helmet());

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) {
          callback(null, true);
          return;
        }

        if (configuredCorsOrigins.includes(origin) || isAllowedDevOrigin(origin)) {
          callback(null, true);
          return;
        }

        callback(new Error(`CORS blocked for origin: ${origin}`));
      },
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
