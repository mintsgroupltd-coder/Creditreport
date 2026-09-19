import { Router } from "express";
import {
  deleteReport,
  getDisputePdf,
  getDisputeTemplates,
  getDisputeText,
  getReport,
  getReportComparison,
  getReportInspector,
  listReports,
  uploadReport,
} from "../controllers/reports.controller";
import { requireAuth } from "../middleware/auth";
import { asyncRoute } from "../middleware/errorHandler";
import { uploadLimiter } from "../middleware/rateLimit";
import { upload } from "../middleware/upload";

export const reportsRouter = Router();

reportsRouter.use(requireAuth);

reportsRouter.post("/", uploadLimiter, upload.single("file"), asyncRoute(uploadReport));
reportsRouter.get("/", asyncRoute(listReports));
reportsRouter.get("/:id", asyncRoute(getReport));
reportsRouter.get("/:id/compare", asyncRoute(getReportComparison));
reportsRouter.get("/:id/inspector", asyncRoute(getReportInspector));
reportsRouter.get("/:id/dispute-templates", asyncRoute(getDisputeTemplates));
reportsRouter.get("/:id/dispute-text", asyncRoute(getDisputeText));
reportsRouter.get("/:id/dispute-pdf", asyncRoute(getDisputePdf));
reportsRouter.delete("/:id", asyncRoute(deleteReport));
