import { Router } from "express";
import { getProfile, updateProfile } from "../controllers/profile.controller";
import { requireAuth } from "../middleware/auth";
import { asyncRoute } from "../middleware/errorHandler";

export const profileRouter = Router();

profileRouter.use(requireAuth);

profileRouter.get("/", asyncRoute(getProfile));
profileRouter.patch("/", asyncRoute(updateProfile));
