import nodemailer from "nodemailer";
import { env } from "../config/env";

interface MailInput {
  to: string;
  subject: string;
  text: string;
}

let transporter: ReturnType<typeof nodemailer.createTransport> | null = null;

function getTransporter() {
  if (!env.smtp.host || !env.smtp.user || !env.smtp.pass) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.port === 465,
      auth: { user: env.smtp.user, pass: env.smtp.pass },
    });
  }
  return transporter;
}

/**
 * Sends mail if SMTP_HOST/SMTP_USER/SMTP_PASS are configured; otherwise
 * logs the content server-side and returns `{ sent: false }` rather than
 * throwing, since a missing mail provider shouldn't break the
 * forgot-password flow itself (the account isn't enumerable either way —
 * see auth.controller.ts).
 */
export async function sendMail({ to, subject, text }: MailInput): Promise<{ sent: boolean }> {
  const t = getTransporter();
  if (!t) {
    // eslint-disable-next-line no-console
    console.log(`[mailer] SMTP not configured — would have sent to ${to}:\nSubject: ${subject}\n\n${text}`);
    return { sent: false };
  }
  await t.sendMail({ from: env.smtp.from, to, subject, text });
  return { sent: true };
}
