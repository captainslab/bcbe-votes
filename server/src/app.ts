import express from "express";
import pinoHttp from "pino-http";
import { config } from "./config/env";
import { applySecurity } from "./middleware/security";
import { errorHandler, notFoundHandler } from "./middleware/error";
import publicRoutes from "./routes/public";
import adminRoutes from "./routes/admin";
import boardsRouter, { webhookHandler } from "./routes/boards";
import donationsRouter from "./routes/donations";
import { logger } from "./logging/logger";
import { chatRouter } from "./routes/chat";
import { boardCompatRouter, dashboardCompatRouter } from "./routes/compat";
import { boardContext } from "./middleware/boardContext";

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

// Resolve board context from X-Board-Slug header or subdomain
app.use(boardContext);

// Public compatibility routes restored after cleanup.
// Must mount before broad API routes so slug/dashboard/chat paths do not get swallowed.
app.use("/api/chat", chatRouter);
app.use("/api/chatbot", chatRouter);
app.use("/api/dashboard", dashboardCompatRouter);
app.use("/api/boards/bcbe", boardCompatRouter);

app.use("/api", publicRoutes);
app.use("/api/boards", boardsRouter);
app.use("/api/donations", donationsRouter);
app.use("/api", adminRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
