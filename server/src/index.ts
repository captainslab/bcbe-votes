import { app } from "./app";
import { config } from "./config/env";
import { logger } from "./logging/logger";

const port = config.port;

const server = app.listen(port, process.env.BIND_HOST || process.env.HOST || "127.0.0.1", () => {
  logger.info(`Server listening on port ${port}`);
});

export default server;
