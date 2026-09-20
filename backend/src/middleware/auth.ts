import { NextFunction, Request, Response } from "express";
import { prisma } from "../config/prisma";
import { verifyAuthToken } from "../utils/jwt";

export interface AuthenticatedRequest extends Request {
  user?: { id: string; email: string; jti: string };
}

/**
 * Reads `Authorization: Bearer <token>`, verifies it, and attaches
 * `req.user`. Responds 401 rather than throwing, so routes stay simple.
 *
 * Beyond the JWT signature/expiry check, this also looks up the token's
 * `jti` in the Session table and rejects it if that session has been
 * revoked (log out this device / log out everywhere — see
 * auth.controller.ts's session endpoints) or doesn't exist at all. JWTs
 * are otherwise stateless and can't be revoked before they expire, so
 * this one DB read per request is the cost of actually being able to
 * log someone out. `lastSeenAt` is refreshed best-effort — its failure
 * never blocks the request.
 */
export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or malformed Authorization header" });
  }

  const token = header.slice("Bearer ".length);
  try {
    const payload = verifyAuthToken(token);
    if (!payload.jti) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    const session = await prisma.session.findUnique({ where: { jti: payload.jti } });
    if (!session || session.revokedAt) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } }).catch(() => undefined);

    req.user = { id: payload.userId, email: payload.email, jti: payload.jti };
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}
