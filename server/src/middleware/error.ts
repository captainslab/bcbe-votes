import { NextFunction, Request, Response } from "express";
import { HttpError } from "../utils/httpError";
import { logger } from "../logging/logger";

export const notFoundHandler = (_req: Request, res: Response) => {
  res.status(404).json({ error: "Not found" });
};

export const errorHandler = (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const isHttpError = err instanceof HttpError;
  const status = isHttpError ? err.status : 500;
  const message = isHttpError ? err.message : "Internal server error";

  logger.error({ err }, "Request failed");

  if (process.env.NODE_ENV === "production") {
    return res.status(status).json({ error: message });
  }

  return res.status(status).json({
    error: message,
    details: isHttpError ? err.details : String(err),
  });
};
