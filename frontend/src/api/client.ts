import { AccountDetail, ReportDetail, ReportSummary, RiskSummary } from "./types";

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

  getDisputeText: (id: string) => request<string>(`/reports/${id}/dispute-text`),

  deleteReport: (id: string) => request<void>(`/reports/${id}`, { method: "DELETE" }),

  getAccount: (id: string) => request<AccountDetail>(`/accounts/${id}`),
};

export { ApiError };
