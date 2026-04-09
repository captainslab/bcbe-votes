import express from "express";
import pinoHttp from "pino-http";
import { config } from "./config/env";
import { applySecurity } from "./middleware/security";
import { errorHandler, notFoundHandler } from "./middleware/error";
import publicRoutes from "./routes/public";
import adminRoutes from "./routes/admin";
import { logger } from "./logging/logger";

const app = express();

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
app.use("/api", adminRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

const port = config.port;
app.listen(port, () => {
  logger.info(`Server listening on port ${port}`);
});

export default app;
