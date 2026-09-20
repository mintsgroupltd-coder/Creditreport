import crypto from "crypto";
import jwt, { SignOptions } from "jsonwebtoken";
import { env } from "../config/env";

export interface AuthTokenPayload {
  userId: string;
  email: string;
  // A per-token unique id, mirrored in the Session table so a token can
  // be revoked (log out this device / log out everywhere) despite JWTs
  // otherwise being stateless — see middleware/auth.ts's requireAuth,
  // which looks this up on every request.
  jti: string;
}

/** Generates the jti up front (rather than inside signAuthToken) so the
 * caller can create the matching Session row with the same id before or
 * after signing, in whichever order a given controller finds cleanest. */
export function generateJti(): string {
  return crypto.randomUUID();
}

export function signAuthToken(payload: Omit<AuthTokenPayload, "jti">, jti: string): string {
  // jsonwebtoken's types want a numeric seconds count or a template-literal
  // "StringValue" (e.g. "7d") for expiresIn, not a plain `string` — which
  // is all we can promise for something read out of an env var at runtime.
  const options: SignOptions = { expiresIn: env.jwtExpiresIn as SignOptions["expiresIn"] };
  return jwt.sign({ ...payload, jti }, env.jwtSecret, options);
}

export function verifyAuthToken(token: string): AuthTokenPayload {
  return jwt.verify(token, env.jwtSecret) as AuthTokenPayload;
}

/** A short-lived, distinctly-shaped token issued between "password
 * correct" and "TOTP code confirmed" for an account with 2FA enabled —
 * it proves the password step passed without yet being a real session,
 * so it deliberately carries no `jti` and is never accepted by
 * requireAuth (verifyAuthToken's caller checks for a Session row that a
 * pending2fa token was never given one of). 10 minutes is generous for
 * typing a 6-digit code but short enough that a captured pending token
 * left over in browser history/logs is worth little. */
export interface Pending2faTokenPayload {
  userId: string;
  pending2fa: true;
}

const PENDING_2FA_EXPIRES_IN = "10m";

export function signPending2faToken(userId: string): string {
  return jwt.sign({ userId, pending2fa: true }, env.jwtSecret, { expiresIn: PENDING_2FA_EXPIRES_IN });
}

export function verifyPending2faToken(token: string): Pending2faTokenPayload {
  const payload = jwt.verify(token, env.jwtSecret) as Partial<Pending2faTokenPayload>;
  if (!payload.pending2fa || !payload.userId) {
    throw new Error("Not a valid pending-2FA token");
  }
  return payload as Pending2faTokenPayload;
}
