import { Router } from "express";
import { getReconciliation } from "../controllers/reconciliation.controller";
import { requireAuth } from "../middleware/auth";
import { asyncRoute } from "../middleware/errorHandler";

export const reconciliationRouter = Router();

reconciliationRouter.use(requireAuth);
reconciliationRouter.get("/", asyncRoute(getReconciliation));
