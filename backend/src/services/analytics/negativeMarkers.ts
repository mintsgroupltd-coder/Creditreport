import { ParsedReport } from "../parsing/types";
import { AlertFinding, AnalyticsInput } from "./types";

/** Accounts currently in default with no corroborated satisfaction. */
export function findActiveDefaults(report: ParsedReport) {
  return report.accounts.filter((a) => a.status === "DEFAULT");
}

/** CCJ/judgment events not marked satisfied. */
export function findUnsatisfiedCcjs(report: ParsedReport) {
  return report.events.filter((e) => e.type === "CCJ" && e.detail?.isSatisfied !== true);
}

export function totalNegativeBalance(report: ParsedReport): number {
  const defaultTotal = findActiveDefaults(report).reduce((sum, a) => sum + (a.currentBalance ?? a.defaultBalance ?? 0), 0);
  const ccjTotal = findUnsatisfiedCcjs(report).reduce((sum, e) => sum + (e.amount ?? 0), 0);
  return defaultTotal + ccjTotal;
}

export interface UtilisationRow {
  bureauRef?: string;
  lenderName: string;
  balance: number;
  limit: number;
  utilisation: number; // 0..1+
}

export function computeUtilisation(report: ParsedReport): UtilisationRow[] {
  return report.accounts
    .filter((a) => a.status === "ACTIVE" && a.creditLimit && a.creditLimit > 0 && a.currentBalance !== undefined)
    .map((a) => ({
      bureauRef: a.bureauRef,
      lenderName: a.lenderName,
      balance: a.currentBalance!,
      limit: a.creditLimit!,
      utilisation: a.currentBalance! / a.creditLimit!,
    }));
}

const HIGH_UTILISATION_THRESHOLD = 0.5;
const HEAVY_SEARCH_WINDOW_DAYS = 365;
const HEAVY_SEARCH_THRESHOLD = 20;

export function negativeMarkerAlerts({ report, now = new Date() }: AnalyticsInput): AlertFinding[] {
  const alerts: AlertFinding[] = [];

  for (const ccj of findUnsatisfiedCcjs(report)) {
    alerts.push({
      type: "UNSATISFIED_CCJ",
      severity: "CRITICAL",
      message: `Unsatisfied County Court Judgment for £${(ccj.amount ?? 0).toLocaleString("en-GB")} (${ccj.detail?.caseNumber ?? "no case number on file"}, ${ccj.date}).`,
      relatedRefs: { eventRef: ccj.accountRef },
    });
  }

  for (const account of findActiveDefaults(report)) {
    const balance = account.currentBalance ?? account.defaultBalance ?? 0;
    alerts.push({
      type: "ACTIVE_DEFAULT",
      severity: balance > 1000 ? "CRITICAL" : "WARNING",
      message: `${account.lenderName} (${account.bureauRef ?? "unlisted ref"}): defaulted ${account.defaultDate ?? "date unknown"}, £${balance.toLocaleString("en-GB")} still showing as owed.`,
      relatedRefs: { accountRef: account.bureauRef },
    });
  }

  for (const row of computeUtilisation(report)) {
    if (row.utilisation >= HIGH_UTILISATION_THRESHOLD) {
      alerts.push({
        type: "HIGH_UTILISATION",
        severity: row.utilisation >= 0.85 ? "CRITICAL" : "WARNING",
        message: `${row.lenderName} (${row.bureauRef ?? "unlisted ref"}) is at ${Math.round(row.utilisation * 100)}% of its £${row.limit.toLocaleString("en-GB")} limit.`,
        relatedRefs: { accountRef: row.bureauRef },
      });
    }
  }

  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - HEAVY_SEARCH_WINDOW_DAYS);
  const recentSearches = report.events.filter((e) => e.type === "SEARCH" && new Date(e.date) >= cutoff);
  if (recentSearches.length >= HEAVY_SEARCH_THRESHOLD) {
    alerts.push({
      type: "SEARCH_VOLUME",
      severity: recentSearches.length >= 50 ? "WARNING" : "INFO",
      message: `${recentSearches.length} searches/enquiries recorded in the last 12 months — a high volume can read as active credit-seeking to a manual underwriter, even though quotation searches don't directly affect the score.`,
    });
  }

  return alerts;
}
