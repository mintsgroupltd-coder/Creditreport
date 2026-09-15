import { Router } from "express";
import { deleteReport, getDisputeText, getReport, listReports, uploadReport } from "../controllers/reports.controller";
import { requireAuth } from "../middleware/auth";
import { asyncRoute } from "../middleware/errorHandler";
import { upload } from "../middleware/upload";

export const reportsRouter = Router();

reportsRouter.use(requireAuth);

reportsRouter.post("/", upload.single("file"), asyncRoute(uploadReport));
reportsRouter.get("/", asyncRoute(listReports));
reportsRouter.get("/:id", asyncRoute(getReport));
reportsRouter.get("/:id/dispute-text", asyncRoute(getDisputeText));
reportsRouter.delete("/:id", asyncRoute(deleteReport));
