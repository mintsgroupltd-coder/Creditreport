import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required("DATABASE_URL"),
  jwtSecret: required("JWT_SECRET"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
  corsOrigin: (process.env.CORS_ORIGIN ?? "http://localhost:5173").split(","),
  maxUploadBytes: Number(process.env.MAX_UPLOAD_BYTES ?? 10 * 1024 * 1024),
  // Used to build the link inside a password-reset email. Falls back to
  // the first configured CORS origin (almost always the deployed
  // frontend's own URL) so this doesn't need a separate env var in the
  // common case, but can be overridden if they ever differ.
  frontendUrl: process.env.FRONTEND_URL ?? (process.env.CORS_ORIGIN ?? "http://localhost:5173").split(",")[0],
  // SMTP is optional. Without it, password-reset emails are logged to the
  // server console instead of sent — fine for local/demo use, but real
  // deployments should set these so users actually receive the email.
  smtp: {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.SMTP_FROM ?? "no-reply@credit-report-analyzer.local",
  },
  // Shared secret an external scheduler (a Render Cron Job, a GitHub
  // Actions schedule, etc.) presents in an `x-internal-secret` header to
  // call POST /api/disputes/run-reminders — this endpoint isn't tied to
  // a logged-in user, so it needs its own gate rather than requireAuth.
  // Undefined disables the endpoint entirely (see disputes.controller.ts).
  internalTaskSecret: process.env.INTERNAL_TASK_SECRET,
};
