import { Router } from "express";
import { getAuditLog, getProfile, updateProfile, updateRecheckReminder } from "../controllers/profile.controller";
import { requireAuth } from "../middleware/auth";
import { asyncRoute } from "../middleware/errorHandler";

export const profileRouter = Router();

profileRouter.use(requireAuth);

profileRouter.get("/", asyncRoute(getProfile));
profileRouter.patch("/", asyncRoute(updateProfile));
profileRouter.patch("/recheck-reminder", asyncRoute(updateRecheckReminder));
profileRouter.get("/audit-log", asyncRoute(getAuditLog));
