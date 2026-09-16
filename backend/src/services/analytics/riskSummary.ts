import { ParsedReport } from "../parsing/types";
import { detectDuplicateAccounts, detectIdentityAnomalies } from "./anomalyDetection";
import { findActiveDefaults, findUnsatisfiedCcjs, negativeMarkerAlerts, totalNegativeBalance } from "./negativeMarkers";
import { AlertFinding, RiskSummary } from "./types";

function computeRiskLevel(alerts: AlertFinding[]): RiskSummary["riskLevel"] {
  const critical = alerts.filter((a) => a.severity === "CRITICAL").length;
  const warning = alerts.filter((a) => a.severity === "WARNING").length;
  if (critical >= 3) return "SEVERE";
  if (critical >= 1) return "HIGH";
  if (warning >= 1) return "MEDIUM";
  return "LOW";
}

function buildSuggestedActions(report: ParsedReport, alerts: AlertFinding[]): string[] {
  const actions: string[] = [];

  const ccjs = findUnsatisfiedCcjs(report);
  if (ccjs.length > 0) {
    actions.push(
      "Check whether the unsatisfied CCJ has actually been paid — if so, get a Certificate of Satisfaction from the court and pass it to the bureau; if not, paying within one month of judgment is the only way to have it removed outright."
    );
  }

  const defaults = findActiveDefaults(report);
  if (defaults.length > 0) {
    const largest = [...defaults].sort((a, b) => (b.currentBalance ?? 0) - (a.currentBalance ?? 0))[0];
    actions.push(
      `Deal with the largest active default first (${largest.lenderName}, £${(largest.currentBalance ?? largest.defaultBalance ?? 0).toLocaleString("en-GB")}) — request a debt validation letter before paying anything, then negotiate a full-and-final settlement in writing.`
    );
  }

  if (alerts.some((a) => a.type === "HIGH_UTILISATION")) {
    actions.push("Pay down the card(s) flagged for high utilisation below 30% of their limit — this is usually the fastest score improvement available, since it doesn't depend on any third party.");
  }

  if (alerts.some((a) => a.type === "DOB_MISMATCH" || a.type === "NAME_VARIATION" || a.type === "MIXED_FILE_RISK")) {
    actions.push('Use the "Export dispute text" button on the flagged account(s) to send a rectification request to the bureau and the lender(s) involved.');
  }

  if (alerts.some((a) => a.type === "SEARCH_VOLUME")) {
    actions.push("Pause new credit and loan-comparison applications for a few months while the items above are resolved, so the file reads calmer to a manual underwriter.");
  }

  if (actions.length === 0) {
    actions.push("No urgent negative items were found — the main lever left is keeping utilisation low and payment history clean.");
  }

  return actions;
}

function buildSummaryText(report: ParsedReport, alerts: AlertFinding[], negativeTotal: number, riskLevel: RiskSummary["riskLevel"]): string {
  const defaults = findActiveDefaults(report);
  const ccjs = findUnsatisfiedCcjs(report);
  const settledCount = report.accounts.filter((a) => a.status === "SETTLED" || a.status === "SATISFIED").length;

  const parts: string[] = [];
  parts.push(`Overall risk level: ${riskLevel}.`);

  if (ccjs.length > 0) {
    parts.push(`There ${ccjs.length === 1 ? "is" : "are"} ${ccjs.length} unsatisfied County Court Judgment${ccjs.length === 1 ? "" : "s"} on file — this is usually the single most damaging item on a UK credit report.`);
  }
  if (defaults.length > 0) {
    parts.push(`${defaults.length} account${defaults.length === 1 ? "" : "s"} ${defaults.length === 1 ? "is" : "are"} in active default, totalling roughly £${negativeTotal.toLocaleString("en-GB")} in outstanding negative balance.`);
  }
  if (settledCount > 0) {
    parts.push(`On the positive side, ${settledCount} account${settledCount === 1 ? "" : "s"} ${settledCount === 1 ? "has" : "have"} been settled to good standing.`);
  }
  if (alerts.some((a) => a.type === "DOB_MISMATCH" || a.type === "MIXED_FILE_RISK")) {
    parts.push("Some accounts are recorded against a different date of birth than the applicant's own details, which is worth querying directly with the bureau.");
  }
  if (parts.length === 1) {
    parts.push("No active defaults, unsatisfied judgments, or identity anomalies were found.");
  }

  return parts.join(" ");
}

export function buildRiskSummary(report: ParsedReport, now: Date = new Date()): RiskSummary {
  const alerts: AlertFinding[] = [
    ...negativeMarkerAlerts({ report, now }),
    ...detectIdentityAnomalies(report),
    ...detectDuplicateAccounts(report),
  ];

  const negativeTotal = totalNegativeBalance(report);
  const riskLevel = computeRiskLevel(alerts);

  return {
    riskLevel,
    totalNegativeBalance: negativeTotal,
    activeDefaultCount: findActiveDefaults(report).length,
    unsatisfiedCcjCount: findUnsatisfiedCcjs(report).length,
    highUtilisationCount: alerts.filter((a) => a.type === "HIGH_UTILISATION").length,
    summary: buildSummaryText(report, alerts, negativeTotal, riskLevel),
    suggestedActions: buildSuggestedActions(report, alerts),
    alerts,
  };
}
