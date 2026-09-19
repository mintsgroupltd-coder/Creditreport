import { Router } from "express";
import { createDispute, getEscalationPackPdf, getTrackingSheetPdf, listDisputes, updateDispute } from "../controllers/disputes.controller";
import { requireAuth } from "../middleware/auth";
import { asyncRoute } from "../middleware/errorHandler";

export const disputesRouter = Router();

disputesRouter.use(requireAuth);

disputesRouter.post("/", asyncRoute(createDispute));
disputesRouter.get("/", asyncRoute(listDisputes));
disputesRouter.patch("/:id", asyncRoute(updateDispute));
disputesRouter.get("/:id/tracking-sheet-pdf", asyncRoute(getTrackingSheetPdf));
disputesRouter.get("/:id/escalation-pack-pdf", asyncRoute(getEscalationPackPdf));
