import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { SharedReportView } from "../api/types";
import { StatCard } from "../components/StatCard";

function money(value: number): string {
  return `£${Math.round(value).toLocaleString("en-GB")}`;
}

const RISK_STYLES: Record<string, string> = {
  LOW: "bg-good/15 text-good",
  MEDIUM: "bg-warn/15 text-warn",
  HIGH: "bg-critical/15 text-critical",
  SEVERE: "bg-critical/15 text-critical",
};

const SEVERITY_STYLES: Record<string, string> = {
  CRITICAL: "bg-critical/15 text-critical",
  WARNING: "bg-warn/15 text-warn",
  INFO: "bg-slate-500/15 text-slate-400",
};

/**
 * Public, unauthenticated page at /shared/:token — renders the trimmed,
 * read-only view returned by GET /api/shared/:token. Deliberately does
 * NOT use AppShell: AppShell assumes a logged-in user (it renders a
 * logout button and account nav from useAuth()), which makes no sense
 * here since a share-link viewer has no account at all. This is a
 * minimal standalone layout instead, styled with the same theme tokens
 * as the rest of the app.
 */
export function SharedReportPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<SharedReportView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    api
      .getSharedReport(token)
      .then(setData)
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : "This share link is invalid, expired, or has been revoked.")
      );
  }, [token]);

  return (
    <div className="min-h-screen bg-surface">
      <header className="border-b border-border">
        <div className="mx-auto max-w-5xl px-6 py-4">
          <span className="text-sm font-semibold tracking-wide text-slate-100">Credit Report Analyzer</span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-6 rounded-lg border border-accent/40 bg-accent/5 px-4 py-3 text-sm text-accent">
          Shared read-only view — this is not your own account. Anyone with this link can see the summary below until it expires or is
          revoked. It does not include the raw uploaded document, date of birth, or full postal addresses.
        </div>

        {error && (
          <div className="rounded-lg border border-critical/40 bg-critical/10 px-4 py-8 text-center">
            <p className="text-sm text-critical">{error}</p>
            <p className="mt-2 text-xs text-slate-500">Ask whoever shared this link with you to send a new one.</p>
          </div>
        )}

        {!error && !data && <p className="text-sm text-slate-400">Loading…</p>}

        {data && (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-xl font-semibold text-slate-100">{data.sourceFileName}</h1>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${
                  RISK_STYLES[data.riskLevel] ?? "bg-slate-500/15 text-slate-400"
                }`}
              >
                {data.riskLevel}
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-400">
              {data.bureau} · {data.applicantName ?? "name not detected"} · uploaded{" "}
              {new Date(data.uploadedAt).toLocaleDateString("en-GB")}
            </p>

            <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <StatCard label="Total accounts" value={data.stats.totalAccounts} />
              <StatCard label="Active" value={data.stats.activeAccounts} />
              <StatCard label="Closed / settled" value={data.stats.closedAccounts} tone="good" />
              <StatCard label="In default" value={data.stats.defaultAccounts} tone={data.stats.defaultAccounts > 0 ? "critical" : "default"} />
            </div>

            <section className="mt-6 rounded-lg border border-border bg-panel p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {data.creditScoreEstimate.bureau} scale estimate
                </h2>
                <span className="text-[10px] font-semibold uppercase tracking-wide text-warn">Illustrative, not a real score</span>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-semibold text-slate-100">{data.creditScoreEstimate.score}</span>
                <span className="text-sm text-slate-500">/ {data.creditScoreEstimate.maxScore}</span>
                <span className="ml-2 text-sm font-medium text-slate-300">{data.creditScoreEstimate.band}</span>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                This app's own transparent estimate from the negative markers below — not a real bureau score.
              </p>
            </section>

            <section className="mt-6 rounded-lg border border-border bg-panel p-5">
              <h2 className="text-sm font-semibold text-slate-100">What this means</h2>
              <p className="mt-2 text-sm text-slate-300">{data.summary}</p>
            </section>

            <section className="mt-6">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Negative markers</h2>
              <div className="mt-3 overflow-x-auto rounded-lg border border-border">
                <table className="w-full min-w-[480px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border bg-panel text-left text-xs uppercase tracking-wide text-slate-400">
                      <th className="px-4 py-3">Marker</th>
                      <th className="px-4 py-3 text-right">Count</th>
                      <th className="px-4 py-3 text-right">Total balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-border/60">
                      <td className="px-4 py-3 text-slate-200">Unsatisfied CCJs</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-200">{data.negativeMarkers.unsatisfiedCcjCount}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-critical">{money(data.negativeMarkers.ccjTotalAmount)}</td>
                    </tr>
                    <tr className="border-b border-border/60">
                      <td className="px-4 py-3 text-slate-200">Active defaults</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-200">{data.negativeMarkers.activeDefaultCount}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-critical">{money(data.negativeMarkers.activeDefaultTotal)}</td>
                    </tr>
                    <tr className="border-b border-border/60">
                      <td className="px-4 py-3 text-slate-200">Accounts over 50% utilisation</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-200">{data.negativeMarkers.highUtilisationCount}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-500">—</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3 text-slate-200">Searches in last 12 months</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-200">{data.negativeMarkers.recentSearchCount}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-500">—</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            <section className="mt-8">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Alerts</h2>
              {data.alerts.length === 0 ? (
                <p className="mt-3 text-sm text-slate-500">No alerts on this report.</p>
              ) : (
                <ul className="mt-3 flex flex-col gap-2">
                  {data.alerts.map((a, i) => (
                    <li key={i} className="rounded-lg border border-border bg-panel px-4 py-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">{a.type.replace(/_/g, " ")}</span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                            SEVERITY_STYLES[a.severity] ?? "bg-slate-500/15 text-slate-400"
                          }`}
                        >
                          {a.severity}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-slate-300">{a.message}</p>
                      <p className="mt-1 text-xs text-slate-500">{new Date(a.createdAt).toLocaleDateString("en-GB")}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="mt-8">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Accounts</h2>
              <div className="mt-3 overflow-x-auto rounded-lg border border-border">
                <table className="w-full min-w-[640px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border bg-panel text-left text-xs uppercase tracking-wide text-slate-400">
                      <th className="px-4 py-3">Lender</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Balance</th>
                      <th className="px-4 py-3 text-right">Limit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.accounts.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-4 text-center text-sm text-slate-500">
                          No accounts on this report.
                        </td>
                      </tr>
                    ) : (
                      data.accounts.map((a) => (
                        <tr key={a.id} className="border-b border-border/60">
                          <td className="px-4 py-3 text-slate-200">{a.lenderName}</td>
                          <td className="px-4 py-3 text-slate-300">{a.accountType}</td>
                          <td className="px-4 py-3 text-slate-300">{a.status}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-slate-200">{a.currentBalance ?? "—"}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-slate-200">{a.creditLimit ?? "—"}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
