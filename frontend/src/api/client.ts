import {
  AccountDetail,
  AuditLogEntryRow,
  ContactsResponse,
  CreateShareLinkResponse,
  DisputeListResponse,
  DisputeRecordRow,
  DisputeStatus,
  DisputeTemplateOption,
  EnvelopeSize,
  InspectorResponse,
  ProfileResponse,
  ReconciliationResponse,
  ReportComparison,
  ReportDetail,
  ReportSummary,
  RiskSummary,
  SessionRow,
  ShareLinkRow,
  SharedReportView,
  SignatureMode,
  SimulatedCreditFileResponse,
  SimulatedTokenResponse,
  SimulatedVerifyIdentityResponse,
} from "./types";
import { SendDisputeEmailInput } from "./types";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api";

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function getToken(): string | null {
  try {
    return localStorage.getItem("token");
  } catch {
    return null;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...(options.body && !(options.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(res.status, body.error ?? "Request failed");
  }
  if (res.status === 204) return undefined as T;
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("text/plain")) return (await res.text()) as unknown as T;
  return res.json();
}

export const api = {
  register: (email: string, password: string) =>
    request<{ token: string; user: { id: string; email: string } }>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  login: (email: string, password: string) =>
    request<{ token: string; user: { id: string; email: string } } | { requiresTotp: true; pendingToken: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  loginVerifyTotp: (pendingToken: string, code: string) =>
    request<{ token: string; user: { id: string; email: string } }>("/auth/login/verify-totp", {
      method: "POST",
      body: JSON.stringify({ pendingToken, code }),
    }),

  logout: () => request<{ loggedOut: true }>("/auth/logout", { method: "POST" }),

  setupTotp: () => request<{ secret: string; otpauthUrl: string; qrCodeDataUrl: string }>("/auth/2fa/setup", { method: "POST" }),

  confirmTotp: (code: string) =>
    request<{ enabled: true; backupCodes: string[] }>("/auth/2fa/confirm", { method: "POST", body: JSON.stringify({ code }) }),

  disableTotp: (password: string) =>
    request<{ enabled: false }>("/auth/2fa/disable", { method: "POST", body: JSON.stringify({ password }) }),

  listSessions: () => request<{ sessions: SessionRow[] }>("/auth/sessions"),

  revokeSession: (sessionId: string) => request<{ revoked: true }>(`/auth/sessions/${sessionId}`, { method: "DELETE" }),

  revokeOtherSessions: () => request<{ revokedCount: number }>("/auth/sessions/revoke-others", { method: "POST" }),

  uploadReport: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<{ reportId: string; bureau: string; warnings: string[]; riskSummary: RiskSummary }>("/reports", {
      method: "POST",
      body: form,
    });
  },

  listReports: () => request<{ reports: ReportSummary[] }>("/reports"),

  getReport: (id: string) => request<ReportDetail>(`/reports/${id}`),

  getDisputeTemplates: (id: string) => request<{ templates: DisputeTemplateOption[] }>(`/reports/${id}/dispute-templates`),

  getDisputeText: (id: string, template: string = "auto", correctionStatement?: string) => {
    const params = new URLSearchParams({ template });
    if (correctionStatement) params.set("correctionStatement", correctionStatement);
    return request<string>(`/reports/${id}/dispute-text?${params.toString()}`);
  },

  deleteReport: (id: string) => request<void>(`/reports/${id}`, { method: "DELETE" }),

  getAccount: (id: string) => request<AccountDetail>(`/accounts/${id}`),

  updateLenderContact: (accountId: string, contactAddress: string | null) =>
    request<{ contactAddress: string | null }>(`/accounts/${accountId}/lender-contact`, {
      method: "PATCH",
      body: JSON.stringify({ contactAddress }),
    }),

  getContacts: () => request<ContactsResponse>("/contacts"),

  getReportComparison: (id: string) => request<ReportComparison>(`/reports/${id}/compare`),

  getReportInspector: (id: string) => request<InspectorResponse>(`/reports/${id}/inspector`),

  getReconciliation: () => request<ReconciliationResponse>("/reconciliation"),

  getProfile: () => request<ProfileResponse>("/profile"),

  updateProfile: (
    fullName: string | null,
    postalAddress: string | null,
    dateOfBirth?: string | null,
    electoralRollRegistered?: boolean | null
  ) =>
    request<ProfileResponse>("/profile", {
      method: "PATCH",
      body: JSON.stringify({ fullName, postalAddress, dateOfBirth, electoralRollRegistered }),
    }),

  /** Sets or clears the opt-in "time to re-check your credit file"
   * reminder — its own endpoint (not updateProfile above) specifically so
   * this can be saved on its own without resending the rest of the
   * identity form, which updateProfile's schema requires in full every
   * time (see profile.controller.ts). */
  updateRecheckReminder: (recheckReminderMonths: number | null) =>
    request<{ recheckReminderMonths: number | null }>("/profile/recheck-reminder", {
      method: "PATCH",
      body: JSON.stringify({ recheckReminderMonths }),
    }),

  /** Most recent 100 sensitive account actions (report views/downloads,
   * share links created, dispute emails sent), newest first — see
   * profile.controller.ts's getAuditLog. */
  getAuditLog: () => request<{ entries: AuditLogEntryRow[] }>("/profile/audit-log"),

  listDisputes: (reportId: string) => request<DisputeListResponse>(`/disputes?reportId=${encodeURIComponent(reportId)}`),

  createDispute: (reportId: string, templateId: string, recipient: string) =>
    request<DisputeRecordRow>("/disputes", { method: "POST", body: JSON.stringify({ reportId, templateId, recipient }) }),

  updateDispute: (id: string, status: DisputeStatus, notes?: string) =>
    request<DisputeRecordRow>(`/disputes/${id}`, { method: "PATCH", body: JSON.stringify({ status, notes }) }),

  forgotPassword: (email: string) => request<{ message: string }>("/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) }),

  resetPassword: (token: string, password: string) =>
    request<{ message: string }>("/auth/reset-password", { method: "POST", body: JSON.stringify({ token, password }) }),

  /** PDFs aren't JSON/text, so this bypasses `request()` and returns a
   * Blob the caller turns into a download via an object URL. */
  async downloadDisputePdf(
    id: string,
    template: string,
    options?: { correctionStatement?: string; envelope?: EnvelopeSize; signature?: SignatureMode }
  ): Promise<Blob> {
    const token = getToken();
    const params = new URLSearchParams({ template });
    if (options?.correctionStatement) params.set("correctionStatement", options.correctionStatement);
    if (options?.envelope && options.envelope !== "none") params.set("envelope", options.envelope);
    if (options?.signature) params.set("signature", options.signature);
    const res = await fetch(`${API_BASE}/reports/${id}/dispute-pdf?${params.toString()}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      throw new ApiError(res.status, body.error ?? "Could not generate the PDF");
    }
    return res.blob();
  },

  /** The generic, unbranded postage-record sheet for a logged dispute —
   * also just a Blob download, same reasoning as downloadDisputePdf. */
  async downloadTrackingSheetPdf(disputeId: string, options?: { service?: string; cost?: string }): Promise<Blob> {
    const token = getToken();
    const params = new URLSearchParams();
    if (options?.service) params.set("service", options.service);
    if (options?.cost) params.set("cost", options.cost);
    const qs = params.toString();
    const res = await fetch(`${API_BASE}/disputes/${disputeId}/tracking-sheet-pdf${qs ? `?${qs}` : ""}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      throw new ApiError(res.status, body.error ?? "Could not generate the tracking sheet");
    }
    return res.blob();
  },

  /** CSV export of the tri-bureau reconciliation table — same eligibility
   * rule as getReconciliation (needs 2+ real bureau reports), just not
   * JSON. Not JSON/text, so this bypasses `request()` and returns a Blob
   * the caller turns into a download via an object URL, same pattern as
   * downloadDisputePdf/downloadEscalationPackPdf below. */
  async exportReconciliationCsv(): Promise<Blob> {
    const token = getToken();
    const res = await fetch(`${API_BASE}/reconciliation/export.csv`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      throw new ApiError(res.status, body.error ?? "Could not export the reconciliation CSV");
    }
    return res.blob();
  },

  /** The bundled ICO/FOS escalation pack for a logged dispute — cover
   * summary, the letter as sent, and the escalation authority's contact
   * details with dated milestones. Only available for the templates
   * that actually have an ICO or FOS escalation route (see
   * escalationAuthorityFor in disputes.controller.ts) — a CCJ dispute's
   * escalation route is the issuing court, not a regulator, so this
   * throws a 400 for that template and the caller shows the message. */
  async downloadEscalationPackPdf(disputeId: string): Promise<Blob> {
    const token = getToken();
    const res = await fetch(`${API_BASE}/disputes/${disputeId}/escalation-pack-pdf`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      throw new ApiError(res.status, body.error ?? "Could not generate the escalation pack");
    }
    return res.blob();
  },

  /** "Equifax credit check portal" SIMULATION — steps 1–3 of the demo
   * wizard on EquifaxGatewaySimulationPage. This app has no real
   * connection to Equifax or any credit reference agency's live systems;
   * every response here always carries `simulated: true` plus a
   * `disclaimer` string (see backend/src/controllers/simulation.controller.ts). */
  simulateEquifaxVerifyIdentity: (fullName: string, dateOfBirth: string, addressLine: string) =>
    request<SimulatedVerifyIdentityResponse>("/simulation/equifax/verify-identity", {
      method: "POST",
      body: JSON.stringify({ fullName, dateOfBirth, addressLine }),
    }),

  simulateEquifaxToken: (verificationId: string) =>
    request<SimulatedTokenResponse>("/simulation/equifax/token", {
      method: "POST",
      body: JSON.stringify({ verificationId }),
    }),

  simulateEquifaxCreditFile: (accessToken: string, reportId?: string) =>
    request<SimulatedCreditFileResponse>("/simulation/equifax/credit-file", {
      method: "POST",
      body: JSON.stringify({ access_token: accessToken, reportId }),
    }),

  createShareLink: (reportId: string, expiresInHours: number) =>
    request<CreateShareLinkResponse>(`/reports/${reportId}/share-links`, {
      method: "POST",
      body: JSON.stringify({ expiresInHours }),
    }),

  listShareLinks: (reportId: string) => request<{ shareLinks: ShareLinkRow[] }>(`/reports/${reportId}/share-links`),

  revokeShareLink: (reportId: string, linkId: string) =>
    request<ShareLinkRow>(`/reports/${reportId}/share-links/${linkId}/revoke`, { method: "PATCH" }),

  /** Unauthenticated on purpose — this is the public share-link viewing
   * endpoint, so it bypasses `request()` (which always attaches an
   * Authorization header when a token happens to be in localStorage) and
   * calls fetch directly instead. */
  async getSharedReport(token: string): Promise<SharedReportView> {
    const res = await fetch(`${API_BASE}/shared/${token}`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      throw new ApiError(res.status, body.error ?? "This share link is invalid, expired, or has been revoked.");
    }
    return res.json();
  },

  /** Explicit, user-initiated send of a dispute letter by email — never
   * automatic. Called only from DisputeTracker.tsx's own confirm panel,
   * after the user has ticked "I have reviewed this letter and want to
   * send it now". Returns the updated DisputeRecordRow (emailSentAt/
   * emailSentTo now set) on success. */
  sendDisputeEmail: (disputeId: string, input: SendDisputeEmailInput) =>
    request<DisputeRecordRow>(`/disputes/${disputeId}/send-email`, { method: "POST", body: JSON.stringify(input) }),

  /** The one-click "everything for this dispute" zip — letter, escalation
   * pack (when this template has one), and postage tracking sheet, plus a
   * README. Not JSON/text, so this bypasses `request()` and returns a
   * Blob, same pattern as downloadDisputePdf/downloadEscalationPackPdf
   * above. */
  async downloadDisputePackZip(disputeId: string): Promise<Blob> {
    const token = getToken();
    const res = await fetch(`${API_BASE}/disputes/${disputeId}/pack.zip`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      throw new ApiError(res.status, body.error ?? "Could not build the dispute pack");
    }
    return res.blob();
  },
};

export { ApiError };
