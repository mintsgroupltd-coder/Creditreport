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

/** Illustrative only — this app's own estimate, never a real bureau score.
 * See backend/src/services/analytics/creditScoreEstimate.ts's doc comment. */
export interface CreditScoreEstimate {
  bureau: Bureau;
  score: number;
  maxScore: number;
  band: string;
  factors: { label: string; impact: number }[];
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
  creditScoreEstimate: CreditScoreEstimate;
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
  /** As reported by this bureau — absent for account types that don't
   * have a limit (loans, current accounts) or when the parser didn't
   * capture one. Matches backend/src/services/analytics/reconciliation.ts. */
  totalCreditLimit: number | null;
  /** currentBalance / totalCreditLimit for this bureau's own cell, computed
   * only when both figures are known and the limit is greater than zero —
   * null otherwise, never assumed to be 0. Purely derived from this
   * report's own numbers, not a bureau-published figure. */
  debtToLimitRatio: number | null;
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

/**
 * "Equifax credit check portal" SIMULATION types — matches
 * backend/src/controllers/simulation.controller.ts exactly. This app has
 * NO real integration with Equifax or any credit reference agency's live
 * systems; `simulated` and `disclaimer` are present on every response on
 * purpose and must always be shown, never hidden as a footnote.
 */
export interface SimulatedVerifyIdentityResponse {
  simulated: true;
  disclaimer: string;
  verificationId: string;
  status: string;
}

export interface SimulatedTokenResponse {
  simulated: true;
  disclaimer: string;
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface SimulatedScore {
  value: number;
  band: string;
  maxValue: number;
  basis: string;
}

export interface SimulatedAccount {
  lenderName: string;
  accountType: string;
  status: string;
  balance: number;
}

export interface SimulatedCreditFileResponse {
  simulated: true;
  disclaimer: string;
  score: SimulatedScore;
  accounts: SimulatedAccount[];
}

export interface ReportComparison {
  hasPrevious: boolean;
  previousReport?: { id: string; bureau: Bureau; uploadedAt: string; sourceFileName: string };
  riskLevel?: { previous: string; current: string };
  stats?: { previous: ReportDetail["stats"]; current: ReportDetail["stats"] };
  negativeMarkers?: { previous: NegativeMarkers; current: NegativeMarkers };
}

/** One row in a report's share-link management list — never carries the
 * link's token or hash, only enough to show its status and usage. Matches
 * backend/src/controllers/shareLinks.controller.ts's listShareLinks. */
export interface ShareLinkRow {
  id: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  lastViewedAt: string | null;
  viewCount: number;
}

/** Returned once, at creation time, by createShareLink — `url` embeds the
 * one-time raw token. It is never returned again by any other endpoint. */
export interface CreateShareLinkResponse {
  id: string;
  url: string;
  expiresAt: string;
}

/** Trimmed account row shown on a public share link — deliberately
 * narrower than AccountRow (no bureauRef/satisfactionDate). */
export interface SharedReportAccountRow {
  id: string;
  lenderName: string;
  accountType: string;
  status: AccountStatus;
  currentBalance: string | null;
  creditLimit: string | null;
  defaultDate: string | null;
  defaultBalance: string | null;
}

/** Trimmed alert row shown on a public share link — deliberately
 * narrower than AlertRow (no id/relatedAccountIds). */
export interface SharedReportAlertRow {
  type: AlertType;
  severity: AlertSeverity;
  message: string;
  createdAt: string;
}

/**
 * The read-only view returned by GET /api/shared/:token — a trimmed
 * subset of ReportDetail. Deliberately excludes rawText, document
 * pins/inspector data, dateOfBirth, and full postal addresses; see
 * backend/src/controllers/shareLinks.controller.ts's getSharedReport doc
 * comment for the full reasoning.
 */
export interface SharedReportView {
  bureau: Bureau;
  sourceFileName: string;
  uploadedAt: string;
  applicantName: string | null;
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "SEVERE";
  summary: string;
  stats: ReportDetail["stats"];
  negativeMarkers: NegativeMarkers;
  creditScoreEstimate: CreditScoreEstimate;
  accounts: SharedReportAccountRow[];
  alerts: SharedReportAlertRow[];
}

/** Declaration merge onto DisputeRecordRow (declared further up this
 * file) rather than editing that interface directly — adds the three
 * fields backend/prisma/schema.prisma's DisputeRecord model carries for
 * email dispatch and reminders (see disputes.controller.ts's
 * sendDisputeEmail/runReminders), without touching the original
 * declaration. TypeScript merges same-named interfaces in one file into a
 * single type, so DisputeRecordRow has all of these fields either way. */
export interface DisputeRecordRow {
  /** Set only once the user has explicitly sent this letter by email from
   * the app (see sendDisputeEmail) — distinct from `sentAt`, which is
   * when they logged having sent it by whatever means, usually post. */
  emailSentAt: string | null;
  emailSentTo: string | null;
  /** Set once the "deadline passed, no response" reminder has gone out
   * for this dispute — see disputeReminders.ts / runReminders. Not shown
   * directly in the UI; the deadline-passed banner is derived purely from
   * `status`/`responseDeadline`, which stay accurate regardless of this. */
  reminderSentAt: string | null;
}

/** Body for POST /disputes/:id/send-email — matches
 * backend/src/controllers/disputes.controller.ts's sendDisputeEmailSchema
 * exactly. `to` is always typed in by the user in DisputeTracker.tsx's own
 * confirm panel, never guessed or pre-filled from anything on the report. */
export interface SendDisputeEmailInput {
  to: string;
  templateId: string;
  envelope?: EnvelopeSize;
  signatureMode?: SignatureMode;
}

/** One entry in the "your devices" list on the settings page. Never
 * carries the session's `jti` — just enough to show and manage it.
 * Matches backend/src/controllers/auth.controller.ts's listSessions. */
export interface SessionRow {
  id: string;
  label: string | null;
  createdAt: string;
  lastSeenAt: string;
  revokedAt: string | null;
  isCurrent: boolean;
}

/** One row of the account's audit log — see profile.controller.ts's
 * getAuditLog. `reportId` is null for actions not tied to a specific
 * report (there are none yet, but the field stays optional for that). */
export interface AuditLogEntryRow {
  id: string;
  action: string;
  reportId: string | null;
  detail: string | null;
  createdAt: string;
}

/** Declaration merge onto ProfileResponse (declared further up this
 * file) — adds the opt-in periodic "time to re-check your credit file"
 * reminder preference, without touching the original declaration. */
export interface ProfileResponse {
  /** Months between reminder emails (e.g. 3/6/12) — null/0 means off. */
  recheckReminderMonths: number | null;
  totpEnabled: boolean;
}
