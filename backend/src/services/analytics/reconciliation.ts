export const RECONCILIATION_BUREAUS = ["EXPERIAN", "EQUIFAX", "TRANSUNION"] as const;
export type ReconciliationBureau = (typeof RECONCILIATION_BUREAUS)[number];

export interface ReconciliationAccountInput {
  id: string;
  lenderId: string;
  lenderName: string;
  accountType: string;
  bureauRef: string | null;
  status: string;
  currentBalance: number | null;
  defaultDate: string | null;
}

export interface ReconciliationReportInput {
  bureau: ReconciliationBureau;
  reportId: string;
  uploadedAt: string;
  sourceFileName: string;
  accounts: ReconciliationAccountInput[];
}

export interface ReconciliationCell {
  reportId: string;
  accountId: string;
  bureauRef: string | null;
  status: string;
  currentBalance: number | null;
  defaultDate: string | null;
}

export interface ReconciliationRow {
  key: string;
  lenderName: string;
  accountType: string;
  cells: Partial<Record<ReconciliationBureau, ReconciliationCell>>;
  discrepancies: string[];
}

export type ReconciliationResult =
  | { eligible: false; bureausIncluded: { bureau: ReconciliationBureau; reportId: string; uploadedAt: string; sourceFileName: string }[]; message: string }
  | {
      eligible: true;
      bureausIncluded: { bureau: ReconciliationBureau; reportId: string; uploadedAt: string; sourceFileName: string }[];
      rows: ReconciliationRow[];
      discrepancyCount: number;
    };

/** Two balances are treated as "the same, allowing for rounding or
 * timing differences between bureaus" when they're within whichever is
 * larger of £50 or 5% of the bigger figure — a fixed small-pound
 * threshold alone would flag noise on big loan balances, and a
 * percentage-only threshold would flag noise on tiny ones. */
export function balancesMateriallyDiffer(a: number, b: number): boolean {
  const tolerance = Math.max(50, Math.max(Math.abs(a), Math.abs(b)) * 0.05);
  return Math.abs(a - b) > tolerance;
}

/**
 * Cross-references one report per bureau — always the caller's choice of
 * which one counts as "current" per bureau, in practice the most
 * recently uploaded — to flag accounts reported inconsistently between
 * them: present on one bureau's file but not another's, or reported
 * with a different status or balance.
 *
 * Matched by (lenderId, accountType) rather than by bureau reference —
 * bureau refs like "C11" are assigned independently by each bureau and
 * never line up across them, but Lender rows are deduplicated by
 * normalized name at upload time (see reportPersistence.ts), so the
 * same real-world creditor lands on the same Lender row regardless of
 * which bureau's report it came from.
 *
 * Pure and DB-free so it can be unit tested directly — the controller
 * (reconciliation.controller.ts) does the Prisma fetch and hands this
 * function already-shaped input.
 */
export function buildReconciliation(reports: ReconciliationReportInput[]): ReconciliationResult {
  const bureausIncluded = reports.map((r) => ({ bureau: r.bureau, reportId: r.reportId, uploadedAt: r.uploadedAt, sourceFileName: r.sourceFileName }));

  if (reports.length < 2) {
    return {
      eligible: false,
      bureausIncluded,
      message:
        reports.length === 0
          ? "Upload at least two real reports (not sample data) from different bureaus — Experian, Equifax and TransUnion — to compare them here."
          : `Only one bureau's report is available so far (${bureausIncluded[0].bureau}). Upload a real report from at least one more bureau to reconcile them.`,
    };
  }

  const bureausAvailable = reports.map((r) => r.bureau);
  const rows = new Map<string, ReconciliationRow>();

  for (const report of reports) {
    for (const account of report.accounts) {
      const key = `${account.lenderId}::${account.accountType}`;
      let row = rows.get(key);
      if (!row) {
        row = { key, lenderName: account.lenderName, accountType: account.accountType, cells: {}, discrepancies: [] };
        rows.set(key, row);
      }
      // If this bureau already has a cell for this lender+type (two open
      // accounts with the same lender and account type — rare, but
      // possible), keep the first one rather than silently overwriting
      // it with the second.
      if (!row.cells[report.bureau]) {
        row.cells[report.bureau] = {
          reportId: report.reportId,
          accountId: account.id,
          bureauRef: account.bureauRef,
          status: account.status,
          currentBalance: account.currentBalance,
          defaultDate: account.defaultDate,
        };
      }
    }
  }

  let discrepancyCount = 0;
  for (const row of rows.values()) {
    const present = bureausAvailable.filter((b) => row.cells[b]);
    const missing = bureausAvailable.filter((b) => !row.cells[b]);

    if (missing.length > 0 && present.length > 0) {
      row.discrepancies.push(
        `Reported by ${present.join(" and ")} but not by ${missing.join(
          " and "
        )}'s most recent upload — could mean it hasn't been furnished there yet, has already been removed, or is genuinely missing from that file.`
      );
    }

    const statuses = new Set(present.map((b) => row.cells[b]!.status));
    if (statuses.size > 1) {
      row.discrepancies.push(`Status differs by bureau: ${present.map((b) => `${b} = ${row.cells[b]!.status}`).join(", ")}.`);
    }

    const withBalance = present.filter((b) => row.cells[b]!.currentBalance != null);
    if (withBalance.length > 1) {
      const values = withBalance.map((b) => row.cells[b]!.currentBalance as number);
      if (balancesMateriallyDiffer(Math.max(...values), Math.min(...values))) {
        row.discrepancies.push(
          `Balance differs by bureau: ${withBalance.map((b) => `${b} = £${(row.cells[b]!.currentBalance as number).toLocaleString("en-GB")}`).join(", ")}.`
        );
      }
    }

    discrepancyCount += row.discrepancies.length;
  }

  const sortedRows = Array.from(rows.values()).sort(
    (a, b) => b.discrepancies.length - a.discrepancies.length || a.lenderName.localeCompare(b.lenderName)
  );

  return { eligible: true, bureausIncluded, rows: sortedRows, discrepancyCount };
}
