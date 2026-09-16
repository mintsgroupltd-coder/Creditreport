import { Router } from "express";
import { getAccountDetail, updateAccountLenderContact } from "../controllers/accounts.controller";
import { requireAuth } from "../middleware/auth";
import { asyncRoute } from "../middleware/errorHandler";

export const accountsRouter = Router();

accountsRouter.use(requireAuth);
accountsRouter.get("/:id", asyncRoute(getAccountDetail));
accountsRouter.patch("/:id/lender-contact", asyncRoute(updateAccountLenderContact));
