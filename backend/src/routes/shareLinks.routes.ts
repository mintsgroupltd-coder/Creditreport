import { Router } from "express";
import { createShareLink, getSharedReport, listShareLinks, revokeShareLink } from "../controllers/shareLinks.controller";
import { requireAuth } from "../middleware/auth";
import { asyncRoute } from "../middleware/errorHandler";

/**
 * Two routers, kept deliberately separate so the auth boundary is
 * obvious at the mount site rather than buried in per-route middleware:
 *
 *  - `reportShareLinksRouter` — meant to be mounted at `/api/reports`
 *    (alongside the existing reportsRouter). Every route here requires
 *    auth and checks report ownership in the controller.
 *  - `publicShareRouter` — meant to be mounted at `/api/shared`. No auth
 *    middleware at all: this is the unauthenticated viewing surface the
 *    whole feature exists for.
 *
 * See this project's final report for the exact index.ts mount lines.
 */

export const reportShareLinksRouter = Router();
reportShareLinksRouter.use(requireAuth);
reportShareLinksRouter.post("/:id/share-links", asyncRoute(createShareLink));
reportShareLinksRouter.get("/:id/share-links", asyncRoute(listShareLinks));
reportShareLinksRouter.patch("/:id/share-links/:linkId/revoke", asyncRoute(revokeShareLink));

export const publicShareRouter = Router();
publicShareRouter.get("/:token", asyncRoute(getSharedReport));
