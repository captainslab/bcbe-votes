import { NextFunction, Request, Response } from "express";
import { config } from "../config/env";
import { HttpError } from "../utils/httpError";

export const adminAuth = (req: Request, _res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Basic ")) {
    return next(new HttpError(401, "Unauthorized"));
  }

  const base64Credentials = authHeader.split(" ")[1];
  if (!base64Credentials) return next(new HttpError(401, "Unauthorized"));
  const [user, pass] = Buffer.from(base64Credentials, "base64").toString("utf8").split(":");

  if (user !== config.admin.user || pass !== config.admin.pass) {
    return next(new HttpError(401, "Unauthorized"));
  }

  return next();
};
