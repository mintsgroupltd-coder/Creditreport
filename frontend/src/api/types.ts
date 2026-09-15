export type Bureau = "EXPERIAN" | "EQUIFAX" | "TRANSUNION" | "UNKNOWN";
export type AccountStatus = "ACTIVE" | "SETTLED" | "DEFAULT" | "SATISFIED" | "CLOSED" | "UNKNOWN";
export type AlertSeverity = "INFO" | "WARNING" | "CRITICAL";
export type AlertType =
  | "DOB_MISMATCH"
  | "NAME_VARIATION"
  | "MIXED_FILE_RISK"
  | "DUPLICATE_ACCOUNT"
  | "HIGH_UTILISATION"
  | "UNSATISFIED_CCJ"
  | "ACTIVE_DEFAULT"
  | "SEARCH_VOLUME";

export interface RiskSummary {
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "SEVERE";
  totalNegativeBalance: number;
  activeDefaultCount: number;
  unsatisfiedCcjCount: number;
  highUtilisationCount: number;
  summary: string;
  suggestedActions: string[];
  alerts: { type: AlertType; severity: AlertSeverity; message: string }[];
}

export interface ReportSummary {
  id: string;
  bureau: Bureau;
  sourceFileName: string;
  uploadedAt: string;
  applicantName: string | null;
  _count: { accounts: number; alerts: number };
}

export interface AccountRow {
  id: string;
  bureauRef: string | null;
  lenderName: string;
  accountType: string;
  status: AccountStatus;
  currentBalance: string | null;
  creditLimit: string | null;
  defaultDate: string | null;
  defaultBalance: string | null;
  satisfactionDate: string | null;
}

export interface AlertRow {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  message: string;
  createdAt: string;
}

export interface ReportDetail {
  report: {
    id: string;
    bureau: Bureau;
    sourceFileName: string;
    uploadedAt: string;
    applicantName: string | null;
    dateOfBirth: string | null;
    addresses: { line: string; source?: string }[] | null;
  };
  stats: {
    totalAccounts: number;
    activeAccounts: number;
    closedAccounts: number;
    defaultAccounts: number;
  };
  accounts: AccountRow[];
  events: { id: string; type: string; date: string; amount: string | null; detail: Record<string, unknown> }[];
  alerts: AlertRow[];
}

export interface TimelinePoint {
  kind: "STATUS" | "EVENT";
  date: string;
  statusCode?: string;
  balance?: string | null;
  type?: string;
  amount?: string | null;
  detail?: Record<string, unknown>;
}

export interface AccountDetail {
  account: AccountRow & { openedDate: string | null; linkedAddress: string | null };
  timeline: TimelinePoint[];
}
