import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { ReportDetail } from "../api/types";
import { AccountTable } from "../components/AccountTable";
import { AlertList } from "../components/AlertList";
import { AppShell } from "../components/AppShell";
import { RiskBadge } from "../components/RiskBadge";
import { StatCard } from "../components/StatCard";

function deriveRiskLabel(data: ReportDetail): string {
  const critical = data.alerts.filter((a) => a.severity === "CRITICAL").length;
  const warning = data.alerts.filter((a) => a.severity === "WARNING").length;
  if (critical >= 3) return "SEVERE";
  if (critical >= 1) return "HIGH";
  if (warning >= 1) return "MEDIUM";
  return "LOW";
}

export function ReportDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<ReportDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [disputeText, setDisputeText] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");

  useEffect(() => {
    if (!id) return;
    api
      .getReport(id)
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load this report."));
  }, [id]);

  async function handleExportDispute() {
    if (!id) return;
    const text = await api.getDisputeText(id);
    setDisputeText(text);
  }

  async function handleCopy() {
    if (!disputeText) return;
    try {
      await navigator.clipboard.writeText(disputeText);
      setCopyState("copied");
      setTimeout(() => setCopyState("idle"), 2000);
    } catch {
      // Clipboard API can be blocked — the text is still shown for manual copy.
    }
  }

  if (error) {
    return (
      <AppShell>
        <p className="text-sm text-critical">{error}</p>
      </AppShell>
    );
  }
  if (!data) {
    return (
      <AppShell>
        <p className="text-sm text-slate-400">Loading…</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-slate-100">{data.report.sourceFileName}</h1>
            <RiskBadge label={deriveRiskLabel(data)} />
          </div>
          <p className="mt-1 text-sm text-slate-400">
            {data.report.bureau} · {data.report.applicantName ?? "name not detected"}
            {data.report.dateOfBirth && ` · DOB ${new Date(data.report.dateOfBirth).toLocaleDateString("en-GB")}`}
          </p>
        </div>
        <button
          onClick={handleExportDispute}
          className="rounded-md border border-border px-4 py-2 text-sm font-medium text-slate-200 hover:border-accent hover:text-accent"
        >
          Export dispute text
        </button>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Total accounts" value={data.stats.totalAccounts} />
        <StatCard label="Active" value={data.stats.activeAccounts} />
        <StatCard label="Closed / settled" value={data.stats.closedAccounts} tone="good" />
        <StatCard label="In default" value={data.stats.defaultAccounts} tone={data.stats.defaultAccounts > 0 ? "critical" : "default"} />
      </div>

      {disputeText && (
        <div className="mt-6 rounded-lg border border-border bg-panel p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-100">Dispute letter draft</h2>
            <button onClick={handleCopy} className="text-xs font-medium text-accent hover:underline">
              {copyState === "copied" ? "Copied!" : "Copy to clipboard"}
            </button>
          </div>
          <pre className="mt-3 whitespace-pre-wrap text-xs text-slate-300">{disputeText}</pre>
        </div>
      )}

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Data-quality alerts</h2>
        <div className="mt-3">
          <AlertList alerts={data.alerts} />
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Accounts</h2>
        <div className="mt-3">
          <AccountTable accounts={data.accounts} />
        </div>
      </section>
    </AppShell>
  );
}
