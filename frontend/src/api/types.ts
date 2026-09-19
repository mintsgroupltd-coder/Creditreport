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
  /** True only for the fixture report created by the backend's seed
   * script — badge it clearly so it's never mistaken for a real upload. */
  isSample: boolean;
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
  relatedAccountIds: string[];
}

export interface ReportInsights {
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "SEVERE";
  summary: string;
  suggestedActions: string[];
}

export interface NegativeMarkers {
  unsatisfiedCcjCount: number;
  ccjTotalAmount: number;
  activeDefaultCount: number;
  activeDefaultTotal: number;
  highUtilisationCount: number;
  recentSearchCount: number;
}

/** Compares this report's own self-reported application details against
 * the user's separately confirmed profile identity — see the backend's
 * services/analytics/identityCheck.ts for the full reasoning. Always
 * self-declared vs self-declared, never independently verified. */
export interface IdentityCheck {
  profileConfirmed: boolean;
  nameMatches: boolean | null;
  dobMatches: boolean | null;
  overallMatch: boolean | null;
  message: string;
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
    isSample: boolean;
  };
  identityCheck: IdentityCheck;
  insights: ReportInsights;
  stats: {
    totalAccounts: number;
    activeAccounts: number;
    closedAccounts: number;
    defaultAccounts: number;
  };
  negativeMarkers: NegativeMarkers;
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
  account: AccountRow & { openedDate: string | null; linkedAddress: string | null; lenderContactAddress: string | null };
  timeline: TimelinePoint[];
}

export type DisputeTemplateId = "auto" | "identity" | "ccj" | "default_validation" | "general_accuracy" | "notice_of_correction";

/** Matches backend/src/services/analytics/disputeTextGenerator.ts's
 * NOTICE_OF_CORRECTION_WORD_LIMIT — the word limit Parliament actually
 * set for a section 159(3) notice of correction, not a stylistic choice. */
export const NOTICE_OF_CORRECTION_WORD_LIMIT = 200;

export type EnvelopeSize = "none" | "c5" | "dl";
export type SignatureMode = "digital" | "blank";

export interface DisputeTemplateOption {
  id: DisputeTemplateId;
  label: string;
  description: string;
  relevant: boolean;
}

export interface ContactEntry {
  name: string;
  role: string;
  addressLines: string[];
  phone?: string;
  email?: string;
  sourceUrl: string;
  note?: string;
}

export interface ContactsResponse {
  lastVerified: string;
  bureaus: Record<"EXPERIAN" | "EQUIFAX" | "TRANSUNION", ContactEntry>;
  court: ContactEntry;
  ico: ContactEntry;
  fos: ContactEntry;
}

export interface ProfileResponse {
  email: string;
  fullName: string | null;
  postalAddress: string | null;
  /** ISO date (YYYY-MM-DD), self-declared — never independently verified. */
  dateOfBirth: string | null;
  /** Self-declared, not checked against the actual electoral roll — null = not stated. */
  electoralRollRegistered: boolean | null;
  /** True once fullName + dateOfBirth + postalAddress are all set. Means
   * "the account holder has stated all three", not "verified against an
   * official register" — the app has no access to one. */
  identityConfirmed: boolean;
}

export type DisputeStatus = "SENT" | "RESOLVED" | "NO_RESPONSE";

export interface DisputeRecordRow {
  id: string;
  reportId: string;
  templateId: string;
  recipient: string;
  sentAt: string;
  responseDeadline: string | null;
  deadlineBasis: "statutory" | "advisory" | null;
  status: DisputeStatus;
  resolvedAt: string | null;
  notes: string | null;
}

export interface DisputeListResponse {
  disputes: DisputeRecordRow[];
}

/** One "pin" tying an alert back to where its evidence appears in the
 * report's own extracted text — see the backend's
 * services/analytics/documentPins.ts. This is a position inside the
 * text pdf-parse extracted at upload time, NOT a page/x/y coordinate in
 * the original PDF — the app doesn't keep the original file bytes, only
 * the text. startIndex/endIndex are both null when nothing in the alert
 * could be located in the text at all. */
export interface DocumentPin {
  id: string;
  alertId: string;
  type: AlertType;
  severity: AlertSeverity;
  label: string;
  message: string;
  anchor: string | null;
  startIndex: number | null;
  endIndex: number | null;
}

export interface InspectorResponse {
  reportId: string;
  sourceFileType: string;
  rawText: string;
  pins: DocumentPin[];
}

export type ReconciliationBureauKey = "EXPERIAN" | "EQUIFAX" | "TRANSUNION";

export interface ReconciliationBureauInfo {
  bureau: ReconciliationBureauKey;
  reportId: string;
  uploadedAt: string;
  sourceFileName: string;
}

export interface ReconciliationCell {
  reportId: string;
  accountId: string;
  bureauRef: string | null;
  status: AccountStatus;
  currentBalance: number | null;
  defaultDate: string | null;
}

export interface ReconciliationRow {
  key: string;
  lenderName: string;
  accountType: string;
  cells: Partial<Record<ReconciliationBureauKey, ReconciliationCell>>;
  discrepancies: string[];
}

export type ReconciliationResponse =
  | { eligible: false; bureausIncluded: ReconciliationBureauInfo[]; message: string }
  | { eligible: true; bureausIncluded: ReconciliationBureauInfo[]; rows: ReconciliationRow[]; discrepancyCount: number };

export interface ReportComparison {
  hasPrevious: boolean;
  previousReport?: { id: string; bureau: Bureau; uploadedAt: string; sourceFileName: string };
  riskLevel?: { previous: string; current: string };
  stats?: { previous: ReportDetail["stats"]; current: ReportDetail["stats"] };
  negativeMarkers?: { previous: NegativeMarkers; current: NegativeMarkers };
}
