import {
  AccountDetail,
  ContactsResponse,
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
  SignatureMode,
} from "./types";

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
    request<{ token: string; user: { id: string; email: string } }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

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
};

export { ApiError };
