import { Router } from "express";
import {
  confirmTotp,
  disableTotp,
  forgotPassword,
  login,
  loginVerifyTotp,
  logout,
  register,
  resetPassword,
  revokeOtherSessions,
  revokeSession,
  listSessions,
  setupTotp,
} from "../controllers/auth.controller";
import { requireAuth } from "../middleware/auth";
import { asyncRoute } from "../middleware/errorHandler";
import { authLimiter } from "../middleware/rateLimit";

export const authRouter = Router();

authRouter.post("/register", authLimiter, asyncRoute(register));
authRouter.post("/login", authLimiter, asyncRoute(login));
authRouter.post("/login/verify-totp", authLimiter, asyncRoute(loginVerifyTotp));
authRouter.post("/forgot-password", authLimiter, asyncRoute(forgotPassword));
authRouter.post("/reset-password", authLimiter, asyncRoute(resetPassword));

// Two-factor authentication (TOTP) — see auth.controller.ts's doc
// comments above each handler for exactly what each step guarantees.
authRouter.post("/2fa/setup", requireAuth, asyncRoute(setupTotp));
authRouter.post("/2fa/confirm", requireAuth, asyncRoute(confirmTotp));
authRouter.post("/2fa/disable", requireAuth, asyncRoute(disableTotp));

// Sessions ("your devices")
authRouter.get("/sessions", requireAuth, asyncRoute(listSessions));
authRouter.delete("/sessions/:sessionId", requireAuth, asyncRoute(revokeSession));
authRouter.post("/sessions/revoke-others", requireAuth, asyncRoute(revokeOtherSessions));
authRouter.post("/logout", requireAuth, asyncRoute(logout));
