import { Response } from "express";
import { prisma } from "../config/prisma";
import { AuthenticatedRequest } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";
import {
  buildReconciliation,
  reconciliationToCsv,
  ReconciliationBureau,
  ReconciliationReportInput,
  RECONCILIATION_BUREAUS,
} from "../services/analytics/reconciliation";

/**
 * Cross-references the user's own reports across bureaus (see
 * services/analytics/reconciliation.ts for the actual matching logic).
 * Deliberately excludes sample/fixture reports (Report.isSample) — this
 * feature is about the user's own real reports, and mixing in the demo
 * fixture would produce a meaningless "discrepancy" against it. Reports
 * with an UNKNOWN bureau are excluded too, since there'd be nothing to
 * key them by. Only the most recently uploaded report per bureau is
 * used, so re-uploading after a dispute naturally supersedes the old
 * comparison.
 */
async function loadReconciliationInput(userId: string): Promise<ReconciliationReportInput[]> {
  const candidateReports = await prisma.report.findMany({
    where: { userId, isSample: false, bureau: { in: [...RECONCILIATION_BUREAUS] } },
    orderBy: { uploadedAt: "desc" },
    include: { accounts: { include: { lender: true } } },
  });

  const latestByBureau = new Map<ReconciliationBureau, (typeof candidateReports)[number]>();
  for (const r of candidateReports) {
    const bureau = r.bureau as ReconciliationBureau;
    if (!latestByBureau.has(bureau)) latestByBureau.set(bureau, r);
  }

  return Array.from(latestByBureau.entries()).map(([bureau, r]) => ({
    bureau,
    reportId: r.id,
    uploadedAt: r.uploadedAt.toISOString(),
    sourceFileName: r.sourceFileName,
    accounts: r.accounts.map((a: any) => ({
      id: a.id,
      lenderId: a.lenderId,
      lenderName: a.lender.name,
      accountType: a.accountType,
      bureauRef: a.bureauRef,
      status: a.status,
      currentBalance: a.currentBalance != null ? Number(a.currentBalance) : a.defaultBalance != null ? Number(a.defaultBalance) : null,
      defaultDate: a.defaultDate ? a.defaultDate.toISOString().slice(0, 10) : null,
      totalCreditLimit: a.creditLimit != null ? Number(a.creditLimit) : null,
    })),
  }));
}

export async function getReconciliation(req: AuthenticatedRequest, res: Response) {
  const input = await loadReconciliationInput(req.user!.id);
  res.json(buildReconciliation(input));
}

/**
 * Same comparison as `getReconciliation`, exported as a CSV download
 * instead of JSON. Refuses (400) rather than exporting an empty/meaningless
 * file when fewer than two bureaus' worth of real reports are available —
 * see `reconciliationToCsv`'s own doc comment.
 */
export async function getReconciliationCsv(req: AuthenticatedRequest, res: Response) {
  const input = await loadReconciliationInput(req.user!.id);
  const result = buildReconciliation(input);
  if (!result.eligible) {
    throw new HttpError(400, result.message);
  }

  const csv = reconciliationToCsv(result);
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", 'attachment; filename="reconciliation.csv"');
  res.send(csv);
}
