import { NextFunction, Request, Response } from "express";
import { timingSafeEqual } from "crypto";
import { config } from "../config/env";
import { HttpError } from "../utils/httpError";

const secureEquals = (expected: string, actual: string) => {
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, actualBuffer);
};

export const adminAuth = (req: Request, _res: Response, next: NextFunction) => {
  if (!config.admin.user || !config.admin.pass) {
    return next(new HttpError(503, "Admin access is not configured"));
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Basic ")) {
    return next(new HttpError(401, "Unauthorized"));
  }

  const base64Credentials = authHeader.split(" ")[1];
  if (!base64Credentials) return next(new HttpError(401, "Unauthorized"));
  const decoded = Buffer.from(base64Credentials, "base64").toString("utf8");
  const separatorIndex = decoded.indexOf(":");
  if (separatorIndex < 0) return next(new HttpError(401, "Unauthorized"));
  const user = decoded.slice(0, separatorIndex);
  const pass = decoded.slice(separatorIndex + 1);

  if (!secureEquals(user, config.admin.user) || !secureEquals(pass, config.admin.pass)) {
    return next(new HttpError(401, "Unauthorized"));
  }

  return next();
};
