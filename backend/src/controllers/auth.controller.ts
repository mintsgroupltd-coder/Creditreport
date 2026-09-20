import bcrypt from "bcryptjs";
import crypto from "crypto";
import { Request, Response } from "express";
import { z } from "zod";
import { env } from "../config/env";
import { prisma } from "../config/prisma";
import { AuthenticatedRequest } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";
import { sendMail } from "../utils/mailer";
import { generateJti, signAuthToken, signPending2faToken, verifyPending2faToken } from "../utils/jwt";
import { summarizeUserAgent } from "../utils/session";
import {
  buildOtpauthUrl,
  consumeBackupCode,
  generateBackupCodes,
  generateTotpSecret,
  hashBackupCodes,
  totpQrCodeDataUrl,
  verifyTotpCode,
} from "../utils/totp";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

/** Creates the Session row a new access token's `jti` points at, and
 * signs the token itself — the one place both of those happen together,
 * used by register(), login() (non-2FA accounts), and
 * loginVerifyTotp() (2FA accounts, once the code checks out), so a
 * session can never exist without a matching issued token or vice
 * versa. `label` is a purely descriptive, best-effort User-Agent
 * summary — see utils/session.ts. */
async function issueSessionAndToken(userId: string, email: string, userAgent: string | undefined): Promise<string> {
  const jti = generateJti();
  await prisma.session.create({ data: { userId, jti, label: summarizeUserAgent(userAgent) } });
  return signAuthToken({ userId, email }, jti);
}

export async function register(req: Request, res: Response) {
  const { email, password } = credentialsSchema.parse(req.body);

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new HttpError(409, "An account with that email already exists");

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({ data: { email, passwordHash } });

  const token = await issueSessionAndToken(user.id, user.email, req.headers["user-agent"]);
  res.status(201).json({ token, user: { id: user.id, email: user.email } });
}

/**
 * With 2FA disabled, behaves exactly as before: password checked, a
 * full session token issued immediately. With 2FA enabled, deliberately
 * stops one step short — it returns `{ requiresTotp: true, pendingToken
 * }` instead of a real token, and the caller must then call
 * loginVerifyTotp with that pendingToken plus a 6-digit code (or a
 * backup code) before a real session is ever created. This means a
 * correct password alone is never enough to obtain a working session
 * for a 2FA-protected account.
 */
export async function login(req: Request, res: Response) {
  const { email, password } = credentialsSchema.parse(req.body);

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new HttpError(401, "Invalid email or password");

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new HttpError(401, "Invalid email or password");

  if (user.totpEnabled) {
    return res.json({ requiresTotp: true, pendingToken: signPending2faToken(user.id) });
  }

  const token = await issueSessionAndToken(user.id, user.email, req.headers["user-agent"]);
  res.json({ token, user: { id: user.id, email: user.email } });
}

const verifyTotpSchema = z.object({
  pendingToken: z.string().min(1),
  code: z.string().min(1),
});

/**
 * The second step of login for a 2FA-enabled account. Accepts either a
 * live 6-digit authenticator code or one of the account's remaining
 * backup codes — a matching backup code is consumed (removed from
 * `totpBackupCodeHashes`) so it can't be reused. Only on a match is a
 * real session actually created; a wrong code leaves the account in
 * exactly the same "password verified, not yet logged in" state so it
 * can be retried up to the pendingToken's own 10-minute expiry.
 */
export async function loginVerifyTotp(req: Request, res: Response) {
  const { pendingToken, code } = verifyTotpSchema.parse(req.body);

  let userId: string;
  try {
    userId = verifyPending2faToken(pendingToken).userId;
  } catch {
    throw new HttpError(401, "This login attempt has expired — please log in again.");
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.totpEnabled || !user.totpSecret) {
    throw new HttpError(401, "This login attempt has expired — please log in again.");
  }

  const validTotp = verifyTotpCode(user.totpSecret, code);
  if (!validTotp) {
    const existingHashes = (user.totpBackupCodeHashes as string[] | null) ?? [];
    const remaining = existingHashes.length > 0 ? await consumeBackupCode(existingHashes, code) : null;
    if (remaining === null) throw new HttpError(401, "That code wasn't recognised — check your authenticator app and try again.");
    await prisma.user.update({ where: { id: user.id }, data: { totpBackupCodeHashes: remaining } });
  }

  const token = await issueSessionAndToken(user.id, user.email, req.headers["user-agent"]);
  res.json({ token, user: { id: user.id, email: user.email } });
}

const forgotPasswordSchema = z.object({ email: z.string().email() });

const RESET_TOKEN_BYTES = 32;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

function hashResetToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Always responds with the same generic message whether or not the email
 * belongs to an account, so this can't be used to check which emails are
 * registered. If the account exists, generates a reset token, stores only
 * its hash (never the raw token), and emails (or, without SMTP
 * configured, logs) a link containing the raw token.
 */
export async function forgotPassword(req: Request, res: Response) {
  const { email } = forgotPasswordSchema.parse(req.body);
  const genericMessage = "If an account exists for that email, a password reset link has been sent.";

  const user = await prisma.user.findUnique({ where: { email } });
  if (user) {
    const rawToken = crypto.randomBytes(RESET_TOKEN_BYTES).toString("hex");
    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetTokenHash: hashResetToken(rawToken),
        resetTokenExpiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      },
    });

    const resetLink = `${env.frontendUrl}/reset-password?token=${rawToken}`;
    await sendMail({
      to: email,
      subject: "Reset your Credit Report Analyzer password",
      text: `We received a request to reset your password.\n\nReset it here (valid for 1 hour): ${resetLink}\n\nIf you didn't request this, you can ignore this email.`,
    });
  }

  res.json({ message: genericMessage });
}

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export async function resetPassword(req: Request, res: Response) {
  const { token, password } = resetPasswordSchema.parse(req.body);
  const tokenHash = hashResetToken(token);

  const user = await prisma.user.findFirst({
    where: { resetTokenHash: tokenHash, resetTokenExpiresAt: { gt: new Date() } },
  });
  if (!user) throw new HttpError(400, "This reset link is invalid or has expired — request a new one.");

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, resetTokenHash: null, resetTokenExpiresAt: null },
  });
  // A password reset is exactly the moment an account may have been
  // compromised — revoke every existing session so a stolen token
  // stops working the instant the real owner regains control, rather
  // than staying valid until it naturally expires.
  await prisma.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });

  res.json({ message: "Password updated — you can now log in with your new password." });
}

/*
 * OAuth (Google/Microsoft sign-in) isn't wired up here — the cleanest
 * way to add it is Passport.js with passport-google-oauth20: it
 * verifies the provider's token, then finds-or-creates a User by
 * email exactly like register() above and returns the same JWT shape,
 * so nothing else in the app needs to change.
 */

// ---------------------------------------------------------------------
// Two-factor authentication (TOTP) — setup / confirm / disable
// ---------------------------------------------------------------------

/**
 * POST /api/auth/2fa/setup — authenticated. Generates a new secret and
 * stores it against the user, but does NOT enable 2FA yet — totpEnabled
 * only flips to true once confirmSetup below verifies a real code from
 * an authenticator app, so a half-finished enrollment (secret saved,
 * QR code shown, but never scanned/confirmed) can never lock the
 * account into requiring a code nobody has. Calling this again before
 * confirming just overwrites the pending secret, which is fine — the
 * old one was never active.
 */
export async function setupTotp(req: AuthenticatedRequest, res: Response) {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) throw new HttpError(404, "User not found");

  const secret = generateTotpSecret();
  await prisma.user.update({ where: { id: user.id }, data: { totpSecret: secret } });

  const otpauthUrl = buildOtpauthUrl(user.email, secret);
  const qrCodeDataUrl = await totpQrCodeDataUrl(otpauthUrl);
  res.json({ secret, otpauthUrl, qrCodeDataUrl });
}

const confirmTotpSchema = z.object({ code: z.string().min(1) });

/**
 * POST /api/auth/2fa/confirm — authenticated. Verifies a live code
 * against the secret setupTotp just stored; only then sets
 * totpEnabled=true and generates a fresh set of backup codes, returned
 * in PLAINTEXT in this one response only — only their bcrypt hashes are
 * persisted (see utils/totp.ts), so this is the one and only chance the
 * user has to see and save them.
 */
export async function confirmTotp(req: AuthenticatedRequest, res: Response) {
  const { code } = confirmTotpSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user?.totpSecret) throw new HttpError(400, "Start two-factor setup first — no pending secret found.");

  if (!verifyTotpCode(user.totpSecret, code)) {
    throw new HttpError(400, "That code didn't match — check your authenticator app and try again.");
  }

  const backupCodes = generateBackupCodes();
  const totpBackupCodeHashes = await hashBackupCodes(backupCodes);
  await prisma.user.update({ where: { id: user.id }, data: { totpEnabled: true, totpBackupCodeHashes } });

  res.json({ enabled: true, backupCodes });
}

const disableTotpSchema = z.object({ password: z.string().min(1) });

/**
 * POST /api/auth/2fa/disable — authenticated, and re-checks the
 * account's password rather than trusting the current session alone —
 * turning off a security feature is exactly the kind of action worth
 * that extra confirmation, the same principle as a bank asking for your
 * PIN again before removing a card.
 */
export async function disableTotp(req: AuthenticatedRequest, res: Response) {
  const { password } = disableTotpSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) throw new HttpError(404, "User not found");

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new HttpError(401, "Incorrect password.");

  await prisma.user.update({
    where: { id: user.id },
    data: { totpEnabled: false, totpSecret: null, totpBackupCodeHashes: undefined },
  });
  res.json({ enabled: false });
}

// ---------------------------------------------------------------------
// Sessions ("your devices") — list / revoke one / log out
// ---------------------------------------------------------------------

/** GET /api/auth/sessions — authenticated. Never returns the jti itself
 * (no reason for the client to see it) — just enough to render a
 * "your devices" list, plus `isCurrent` so the session the request
 * itself came from can be marked distinctly (and, e.g., a "log out"
 * button can behave differently for it than for other devices). */
export async function listSessions(req: AuthenticatedRequest, res: Response) {
  const sessions = await prisma.session.findMany({
    where: { userId: req.user!.id },
    orderBy: { lastSeenAt: "desc" },
    select: { id: true, jti: true, label: true, createdAt: true, lastSeenAt: true, revokedAt: true },
  });
  res.json({
    sessions: sessions.map((s: { id: string; jti: string; label: string | null; createdAt: Date; lastSeenAt: Date; revokedAt: Date | null }) => ({
      id: s.id,
      label: s.label,
      createdAt: s.createdAt,
      lastSeenAt: s.lastSeenAt,
      revokedAt: s.revokedAt,
      isCurrent: s.jti === req.user!.jti,
    })),
  });
}

/** DELETE /api/auth/sessions/:sessionId — authenticated, ownership
 * checked. Revoking the session the request itself came from is
 * allowed — that's just an ordinary "log out" — the frontend clears its
 * local token immediately afterward either way. */
export async function revokeSession(req: AuthenticatedRequest, res: Response) {
  const session = await prisma.session.findFirst({ where: { id: req.params.sessionId, userId: req.user!.id } });
  if (!session) throw new HttpError(404, "Session not found");
  if (!session.revokedAt) {
    await prisma.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
  }
  res.json({ revoked: true });
}

/** POST /api/auth/sessions/revoke-others — authenticated. "Log out of
 * all other devices" in one action, e.g. after noticing an unfamiliar
 * entry in the sessions list — leaves the caller's own current session
 * untouched so they aren't logged out of the device they're using to
 * do this. */
export async function revokeOtherSessions(req: AuthenticatedRequest, res: Response) {
  const result = await prisma.session.updateMany({
    where: { userId: req.user!.id, revokedAt: null, jti: { not: req.user!.jti } },
    data: { revokedAt: new Date() },
  });
  res.json({ revokedCount: result.count });
}

/** POST /api/auth/logout — authenticated. Revokes the current session
 * server-side (rather than relying solely on the client dropping its
 * copy of the token), so a token that leaked before logout — in a
 * proxy log, a shared machine's browser history — stops working
 * immediately instead of quietly remaining valid until it expires. */
export async function logout(req: AuthenticatedRequest, res: Response) {
  await prisma.session.updateMany({ where: { userId: req.user!.id, jti: req.user!.jti, revokedAt: null }, data: { revokedAt: new Date() } });
  res.json({ loggedOut: true });
}
