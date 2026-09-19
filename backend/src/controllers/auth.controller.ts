import bcrypt from "bcryptjs";
import crypto from "crypto";
import { Request, Response } from "express";
import { z } from "zod";
import { env } from "../config/env";
import { prisma } from "../config/prisma";
import { HttpError } from "../middleware/errorHandler";
import { sendMail } from "../utils/mailer";
import { signAuthToken } from "../utils/jwt";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export async function register(req: Request, res: Response) {
  const { email, password } = credentialsSchema.parse(req.body);

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new HttpError(409, "An account with that email already exists");

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({ data: { email, passwordHash } });

  const token = signAuthToken({ userId: user.id, email: user.email });
  res.status(201).json({ token, user: { id: user.id, email: user.email } });
}

export async function login(req: Request, res: Response) {
  const { email, password } = credentialsSchema.parse(req.body);

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new HttpError(401, "Invalid email or password");

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new HttpError(401, "Invalid email or password");

  const token = signAuthToken({ userId: user.id, email: user.email });
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

  res.json({ message: "Password updated — you can now log in with your new password." });
}

/*
 * OAuth (Google/Microsoft sign-in) isn't wired up here — the cleanest
 * way to add it is Passport.js with passport-google-oauth20: it
 * verifies the provider's token, then finds-or-creates a User by
 * email exactly like register() above and returns the same JWT shape,
 * so nothing else in the app needs to change.
 */
