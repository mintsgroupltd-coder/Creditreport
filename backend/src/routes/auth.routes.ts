import { Router } from "express";
import { forgotPassword, login, register, resetPassword } from "../controllers/auth.controller";
import { asyncRoute } from "../middleware/errorHandler";
import { authLimiter } from "../middleware/rateLimit";

export const authRouter = Router();

authRouter.post("/register", authLimiter, asyncRoute(register));
authRouter.post("/login", authLimiter, asyncRoute(login));
authRouter.post("/forgot-password", authLimiter, asyncRoute(forgotPassword));
authRouter.post("/reset-password", authLimiter, asyncRoute(resetPassword));
