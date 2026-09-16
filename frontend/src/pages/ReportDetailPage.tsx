import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { ContactsResponse, DisputeTemplateId, DisputeTemplateOption, ReportDetail } from "../api/types";
import { AccountTable } from "../components/AccountTable";
import { AlertList } from "../components/AlertList";
import { AppShell } from "../components/AppShell";
import { BarChart } from "../components/BarChart";
import { ContactsPanel } from "../components/ContactsPanel";
import { RiskBadge } from "../components/RiskBadge";
import { StatCard } from "../components/StatCard";

function money(value: number): string {
  return `£${Math.round(value).toLocaleString("en-GB")}`;
}

export function ReportDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<ReportDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<DisputeTemplateOption[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<DisputeTemplateId>("auto");
  const [disputeText, setDisputeText] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");
  const [contacts, setContacts] = useState<ContactsResponse | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!id) return;
    api
      .getReport(id)
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load this report."));
    api.getDisputeTemplates(id).then((res) => setTemplates(res.templates));
    api.getContacts().then(setContacts).catch(() => undefined);
  }, [id]);

  async function handleExportDispute() {
    if (!id) return;
    const text = await api.getDisputeText(id, selectedTemplate);
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

  async function handleDelete() {
    if (!id) return;
    if (!window.confirm("Delete this report and all its accounts/alerts? You can re-upload the file afterwards to analyse it again.")) return;
    setDeleting(true);
    try {
      await api.deleteReport(id);
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not delete this report.");
      setDeleting(false);
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
            <RiskBadge label={data.insights.riskLevel} />
          </div>
          <p className="mt-1 text-sm text-slate-400">
            {data.report.bureau} · {data.report.applicantName ?? "name not detected"}
            {data.report.dateOfBirth && ` · DOB ${new Date(data.report.dateOfBirth).toLocaleDateString("en-GB")}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selectedTemplate}
            onChange={(e) => setSelectedTemplate(e.target.value as DisputeTemplateId)}
            title="Choose which dispute letter template to generate"
            className="rounded-md border border-border bg-panel px-3 py-2 text-sm text-slate-200 hover:border-accent focus:border-accent focus:outline-none"
          >
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
                {t.relevant ? " ★" : ""}
              </option>
            ))}
          </select>
          <button
            onClick={handleExportDispute}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium text-slate-200 hover:border-accent hover:text-accent"
          >
            Export dispute text
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            title="Delete this report so you can re-upload a corrected or newer file"
            className="rounded-md border border-border px-4 py-2 text-sm font-medium text-slate-400 hover:border-critical hover:text-critical disabled:opacity-50"
          >
            {deleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
      {templates.find((t) => t.id === selectedTemplate)?.description && (
        <p className="mt-2 text-right text-xs text-slate-500">{templates.find((t) => t.id === selectedTemplate)?.description}</p>
      )}

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Total accounts" value={data.stats.totalAccounts} />
        <StatCard label="Active" value={data.stats.activeAccounts} />
        <StatCard label="Closed / settled" value={data.stats.closedAccounts} tone="good" />
        <StatCard label="In default" value={data.stats.defaultAccounts} tone={data.stats.defaultAccounts > 0 ? "critical" : "default"} />
      </div>

      <section className="mt-6 rounded-lg border border-border bg-panel p-5">
        <h2 className="text-sm font-semibold text-slate-100">What this means, and what to do next</h2>
        <p className="mt-2 text-sm text-slate-300">{data.insights.summary}</p>
        {data.insights.suggestedActions.length > 0 && (
          <ol className="mt-4 flex flex-col gap-2">
            {data.insights.suggestedActions.map((action, i) => (
              <li key={i} className="flex gap-3 text-sm text-slate-300">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/15 text-xs font-semibold text-accent">
                  {i + 1}
                </span>
                {action}
              </li>
            ))}
          </ol>
        )}
      </section>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <section className="rounded-lg border border-border bg-panel p-5">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Alerts by severity</h2>
          <div className="mt-4">
            <BarChart
              emptyLabel="No alerts on this report."
              data={[
                { label: "Critical", value: data.alerts.filter((a) => a.severity === "CRITICAL").length, colorClass: "bg-critical" },
                { label: "Warning", value: data.alerts.filter((a) => a.severity === "WARNING").length, colorClass: "bg-warn" },
                { label: "Info", value: data.alerts.filter((a) => a.severity === "INFO").length, colorClass: "bg-slate-400" },
              ]}
            />
          </div>
        </section>
        <section className="rounded-lg border border-border bg-panel p-5">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Accounts by status</h2>
          <div className="mt-4">
            <BarChart
              emptyLabel="No accounts on this report."
              data={[
                { label: "Active", value: data.stats.activeAccounts, colorClass: "bg-accent" },
                { label: "Closed / settled", value: data.stats.closedAccounts, colorClass: "bg-good" },
                { label: "In default", value: data.stats.defaultAccounts, colorClass: "bg-critical" },
              ]}
            />
          </div>
        </section>
      </div>

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

      {contacts && (
        <section className="mt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Useful contacts</h2>
          <p className="mt-1 text-xs text-slate-500">
            Postal addresses for the credit reference agencies and the court centre that handles County Court Judgments, in case
            you need to write to them directly.
          </p>
          <div className="mt-3">
            <ContactsPanel contacts={contacts} reportBureau={data.report.bureau} />
          </div>
        </section>
      )}

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
          <AlertList alerts={data.alerts} accounts={data.accounts} />
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
