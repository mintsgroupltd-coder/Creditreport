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

const app = express();

app.use(cors({ origin: env.corsOrigin }));
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/api/auth", authRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/accounts", accountsRouter);
app.use("/api/contacts", contactsRouter);
app.use("/api/profile", profileRouter);
app.use("/api/disputes", disputesRouter);
app.use("/api/reconciliation", reconciliationRouter);

app.use(errorHandler);

app.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`credit-report-analyzer API listening on :${env.port}`);
});
