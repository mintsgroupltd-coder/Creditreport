import cors from "cors";
import express from "express";
import { env } from "./config/env";
import { errorHandler } from "./middleware/errorHandler";
import { accountsRouter } from "./routes/accounts.routes";
import { authRouter } from "./routes/auth.routes";
import { contactsRouter } from "./routes/contacts.routes";
import { disputesRouter } from "./routes/disputes.routes";
import { profileRouter } from "./routes/profile.routes";
import { reconciliationRouter } from "./routes/reconciliation.routes";
import { reportsRouter } from "./routes/reports.routes";
import { publicShareRouter, reportShareLinksRouter } from "./routes/shareLinks.routes";
import { simulationRouter } from "./routes/simulation.routes";

const app = express();

app.use(cors({ origin: env.corsOrigin }));
app.use(express.json());

// This is a JSON API with no UI of its own — the actual app lives on the
// frontend's URL. A bare "Cannot GET /" here would look broken to anyone
// who lands on this URL directly (e.g. checking the API is up), so "/"
// gives a short, honest pointer instead of a 404.
app.get("/", (_req, res) =>
  res.json({
    name: "Credit Report Analyzer API",
    status: "ok",
    message: "This is the backend API — the app itself is at the frontend URL.",
    health: "/health",
  })
);

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/api/auth", authRouter);
app.use("/api/reports", reportsRouter);
// Second router at the same "/api/reports" prefix for the
// per-report share-link endpoints (POST/GET/PATCH under
// /api/reports/:id/share-links...) — Express matches routes in
// registration order, and none of these paths collide with reportsRouter's.
app.use("/api/reports", reportShareLinksRouter);
app.use("/api/accounts", accountsRouter);
app.use("/api/contacts", contactsRouter);
app.use("/api/profile", profileRouter);
app.use("/api/disputes", disputesRouter);
app.use("/api/reconciliation", reconciliationRouter);
// Clearly-labeled Equifax gateway SIMULATION only — see
// simulation.controller.ts's top-of-file comment. Every response from
// this router carries simulated:true and a disclaimer; nothing here is a
// real connection to Equifax or any credit reference agency.
app.use("/api/simulation", simulationRouter);
// UNAUTHENTICATED on purpose — a shared report link has no logged-in
// user. See shareLinks.controller.ts's getSharedReport for what's
// deliberately excluded from this trimmed, read-only view.
app.use("/api/shared", publicShareRouter);

app.use(errorHandler);

app.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`credit-report-analyzer API listening on :${env.port}`);
});
