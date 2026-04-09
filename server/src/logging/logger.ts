import pino from "pino";
import { config } from "../config/env";

const transport = config.env === "development" ? { target: "pino-pretty" } : undefined;

export const logger = pino({
  level: config.logLevel,
  ...(transport ? { transport } : {}),
  redact: ["req.headers.authorization", "req.headers.cookie"],
});
