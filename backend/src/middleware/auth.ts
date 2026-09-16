import { NextFunction, Request, Response } from "express";
import { verifyAuthToken } from "../utils/jwt";

export interface AuthenticatedRequest extends Request {
  user?: { id: string; email: string };
}

/**
 * Reads `Authorization: Bearer <token>`, verifies it, and attaches
 * `req.user`. Responds 401 rather than throwing, so routes stay simple.
 */
export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or malformed Authorization header" });
  }

  const token = header.slice("Bearer ".length);
  try {
    const payload = verifyAuthToken(token);
    req.user = { id: payload.userId, email: payload.email };
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}
