import { ParsedReport } from "../parsing/types";

export type AlertTypeName =
  | "DOB_MISMATCH"
  | "NAME_VARIATION"
  | "MIXED_FILE_RISK"
  | "DUPLICATE_ACCOUNT"
  | "HIGH_UTILISATION"
  | "UNSATISFIED_CCJ"
  | "ACTIVE_DEFAULT"
  | "SEARCH_VOLUME";

export type AlertSeverityName = "INFO" | "WARNING" | "CRITICAL";

export interface AlertFinding {
  type: AlertTypeName;
  severity: AlertSeverityName;
  message: string;
  relatedRefs?: Record<string, unknown>;
}

export interface RiskSummary {
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "SEVERE";
  totalNegativeBalance: number;
  activeDefaultCount: number;
  unsatisfiedCcjCount: number;
  highUtilisationCount: number;
  summary: string;
  suggestedActions: string[];
  alerts: AlertFinding[];
}

/** Convenience wrapper analytics functions take, so they don't each re-derive it. */
export interface AnalyticsInput {
  report: ParsedReport;
  /** "Today" for age-based checks (12-month search windows, etc) — injected for testability. */
  now?: Date;
}
