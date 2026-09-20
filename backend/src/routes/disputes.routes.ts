import { Router } from "express";
import {
  createDispute,
  getDisputePackZip,
  getEscalationPackPdf,
  getTrackingSheetPdf,
  listDisputes,
  runReminders,
  sendDisputeEmail,
  updateDispute,
} from "../controllers/disputes.controller";
import { requireAuth } from "../middleware/auth";
import { asyncRoute } from "../middleware/errorHandler";

export const disputesRouter = Router();

// Deliberately registered BEFORE disputesRouter.use(requireAuth) below, so
// that auth middleware never runs for it — there's no logged-in user when
// an external scheduler calls this, and it does its own gating instead
// (see runReminders's doc comment in disputes.controller.ts).
disputesRouter.post("/run-reminders", asyncRoute(runReminders));

disputesRouter.use(requireAuth);

disputesRouter.post("/", asyncRoute(createDispute));
disputesRouter.get("/", asyncRoute(listDisputes));
disputesRouter.patch("/:id", asyncRoute(updateDispute));
disputesRouter.get("/:id/tracking-sheet-pdf", asyncRoute(getTrackingSheetPdf));
disputesRouter.get("/:id/escalation-pack-pdf", asyncRoute(getEscalationPackPdf));
disputesRouter.get("/:id/pack.zip", asyncRoute(getDisputePackZip));
disputesRouter.post("/:id/send-email", asyncRoute(sendDisputeEmail));
