import { app } from "./app";
import { config } from "./config/env";
import { logger } from "./logging/logger";

const port = config.port;

const server = app.listen(port, () => {
  logger.info(`Server listening on port ${port}`);
});

export default server;
