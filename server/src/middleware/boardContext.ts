import { NextFunction, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { db, schema } from "../db";

export type BoardContext = {
  id: number;
  slug: string;
  name: string;
};

declare global {
  namespace Express {
    interface Request {
      board?: BoardContext | null;
    }
  }
}

/**
 * Resolves which board is being addressed for this request.
 *
 * Resolution order:
 *   1. `X-Board-Slug` header (set by Nginx from the subdomain)
 *   2. Subdomain extracted from `req.hostname` (e.g. "fcc" from "fcc.boardvotes.io")
 *
 * Sets `req.board` to the matching board row, or null if no slug is found /
 * the slug doesn't match any row (global / root domain view).
 */
export const boardContext = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    let slug: string | null = null;

    // 1. Prefer the Nginx-injected header
    const headerSlug = req.headers["x-board-slug"];
    if (typeof headerSlug === "string" && headerSlug.trim()) {
      slug = headerSlug.trim().toLowerCase();
    }

    // 2. Fall back to extracting from hostname (e.g. fcc.boardvotes.io → fcc)
    if (!slug && req.hostname) {
      const parts = req.hostname.split(".");
      // Only treat the leftmost label as a slug if it is NOT "www" or "boardvotes"
      if (parts.length >= 3 && parts[0] !== "www" && parts[0] !== "boardvotes") {
        slug = parts[0]!.toLowerCase();
      }
    }

    if (!slug) {
      req.board = null;
      return next();
    }

    const board = await db.query.boards.findFirst({
      where: eq(schema.boards.slug, slug),
      columns: { id: true, slug: true, name: true },
    });

    req.board = board ?? null;
    return next();
  } catch (err) {
    // Non-fatal: fall through without board context so global view still works
    req.board = null;
    return next();
  }
};
