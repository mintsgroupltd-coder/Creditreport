import rateLimit from "express-rate-limit";

/** Login/register/password-reset: generous enough for a real user who
 * mistypes a password a few times, tight enough to make brute-forcing or
 * account-enumeration slow. Keyed by IP (express-rate-limit's default). */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts — please wait a few minutes and try again." },
});

/** Report uploads are the most expensive route (PDF text extraction +
 * parsing + a DB transaction), so this is tighter than the auth limiter. */
export const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many uploads — please wait a while before uploading another report." },
});
