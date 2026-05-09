import express from "express";
import pinoHttp from "pino-http";
import { config } from "./config/env";
import { applySecurity } from "./middleware/security";
import { errorHandler, notFoundHandler } from "./middleware/error";
import publicRoutes from "./routes/public";
import adminRoutes from "./routes/admin";
import boardsRouter, { webhookHandler } from "./routes/boards";
import { logger } from "./logging/logger";

export const app = express();

app.set("trust proxy", 1);

// Stripe webhook must receive the raw body — register BEFORE express.json()
app.post("/api/boards/webhook", express.raw({ type: "application/json" }), webhookHandler);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

if (config.enableRequestLogs) {
  app.use(
    pinoHttp({
      logger,
    }),
  );
}

applySecurity(app);

app.use("/api", publicRoutes);
app.use("/api/boards", boardsRouter);
app.use("/api", adminRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
