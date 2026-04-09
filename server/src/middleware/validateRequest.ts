import { ZodError, ZodTypeAny } from "zod";
import { NextFunction, Request, Response } from "express";
import { HttpError } from "../utils/httpError";

export const validateRequest =
  (schema: ZodTypeAny) => (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = schema.parse({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      res.locals.validatedRequest = parsed;
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        return next(new HttpError(400, "Invalid request", err.flatten()));
      }
      return next(err);
    }
  };
