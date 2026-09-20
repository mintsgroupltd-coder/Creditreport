import { Router } from "express";
import { getSimulatedCreditFile, issueToken, verifyIdentity } from "../controllers/simulation.controller";
import { requireAuth } from "../middleware/auth";
import { asyncRoute } from "../middleware/errorHandler";

/**
 * Router for the "Equifax credit check portal" SIMULATION. This app has
 * no real connection to Equifax or any credit reference agency's live
 * systems — see the doc comment at the top of
 * controllers/simulation.controller.ts before changing anything here.
 *
 * Not mounted here on purpose — the caller wires this into the app at
 * `/api/simulation` (see index.ts).
 */
export const simulationRouter = Router();

// Steps 1 and 2 of the demo wizard don't need this app's auth: they only
// mint demo-scoped identifiers (a random verificationId / access_token),
// never touch any user's real data.
simulationRouter.post("/equifax/verify-identity", asyncRoute(verifyIdentity));
simulationRouter.post("/equifax/token", asyncRoute(issueToken));

// Step 3 reads the authenticated user's own uploaded report data (when a
// reportId is given), so it requires this app's real auth — tying it to
// a real logged-in user of THIS app, not of Equifax.
simulationRouter.post("/equifax/credit-file", requireAuth, asyncRoute(getSimulatedCreditFile));
