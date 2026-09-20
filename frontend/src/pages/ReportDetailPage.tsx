import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../api/client";
import {
  ContactsResponse,
  DisputeRecordRow,
  DisputeTemplateId,
  DisputeTemplateOption,
  EnvelopeSize,
  NOTICE_OF_CORRECTION_WORD_LIMIT,
  ReportComparison,
  ReportDetail,
  SignatureMode,
} from "../api/types";
import { AccountTable } from "../components/AccountTable";
import { AlertList } from "../components/AlertList";
import { AppShell } from "../components/AppShell";
import { BarChart } from "../components/BarChart";
import { ComparisonPanel } from "../components/ComparisonPanel";
import { ContactsPanel } from "../components/ContactsPanel";
import { DisputeTracker } from "../components/DisputeTracker";
import { RiskBadge } from "../components/RiskBadge";
import { StatCard } from "../components/StatCard";

function money(value: number): string {
  return `£${Math.round(value).toLocaleString("en-GB")}`;
}

function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;
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
  const [disputes, setDisputes] = useState<DisputeRecordRow[]>([]);
  const [recipient, setRecipient] = useState("");
  const [markingSent, setMarkingSent] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [comparison, setComparison] = useState<ReportComparison | null>(null);
  const [correctionStatement, setCorrectionStatement] = useState("");
  const [envelope, setEnvelope] = useState<EnvelopeSize>("none");
  const [signatureMode, setSignatureMode] = useState<SignatureMode>("digital");

  useEffect(() => {
    if (!id) return;
    api
      .getReport(id)
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load this report."));
    api.getDisputeTemplates(id).then((res) => setTemplates(res.templates));
    api.getContacts().then(setContacts).catch(() => undefined);
    api
      .listDisputes(id)
      .then((res) => setDisputes(res.disputes))
      .catch(() => undefined);
    api.getReportComparison(id).then(setComparison).catch(() => undefined);
  }, [id]);

  // A sensible starting guess for who a given template gets sent to —
  // still editable before "Mark as sent", since a default-validation
  // letter's recipient (a specific lender) can't be guessed reliably.
  useEffect(() => {
    if (selectedTemplate === "ccj") {
      setRecipient(contacts?.court.name ?? "Civil National Business Centre");
    } else if (selectedTemplate === "default_validation") {
      setRecipient("");
    } else if (data && contacts && data.report.bureau !== "UNKNOWN" && data.report.bureau in contacts.bureaus) {
      setRecipient(contacts.bureaus[data.report.bureau as "EXPERIAN" | "EQUIFAX" | "TRANSUNION"].name);
    } else {
      setRecipient(data?.report.bureau ?? "");
    }
  }, [selectedTemplate, contacts, data]);

  async function handleExportDispute() {
    if (!id) return;
    const text = await api.getDisputeText(id, selectedTemplate, selectedTemplate === "notice_of_correction" ? correctionStatement : undefined);
    setDisputeText(text);
  }

  async function handleDownloadPdf() {
    if (!id) return;
    setDownloadingPdf(true);
    try {
      const blob = await api.downloadDisputePdf(id, selectedTemplate, {
        correctionStatement: selectedTemplate === "notice_of_correction" ? correctionStatement : undefined,
        envelope,
        signature: signatureMode,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `dispute-letter-${selectedTemplate}${envelope !== "none" ? `-${envelope}` : ""}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not generate the PDF.");
    } finally {
      setDownloadingPdf(false);
    }
  }

  async function handleDownloadTrackingSheet(disputeId: string) {
    try {
      const blob = await api.downloadTrackingSheetPdf(disputeId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `postage-record-${disputeId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not generate the tracking sheet.");
    }
  }

  async function handleDownloadEscalationPack(disputeId: string) {
    try {
      const blob = await api.downloadEscalationPackPdf(disputeId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `escalation-pack-${disputeId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not generate the escalation pack.");
    }
  }

  async function handleMarkSent() {
    if (!id) return;
    setMarkingSent(true);
    try {
      const created = await api.createDispute(id, selectedTemplate, recipient.trim() || "Recipient not specified");
      setDisputes((prev) => [created, ...prev]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not log this dispute.");
    } finally {
      setMarkingSent(false);
    }
  }

  async function handleMarkResolved(disputeId: string) {
    const updated = await api.updateDispute(disputeId, "RESOLVED");
    setDisputes((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
  }

  async function handleMarkNoResponse(disputeId: string) {
    const updated = await api.updateDispute(disputeId, "NO_RESPONSE");
    setDisputes((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
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
            {data.report.isSample && (
              <span
                title="Fictional fixture data, not a real credit report"
                className="rounded-full bg-warn/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warn"
              >
                Sample data
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-slate-400">
            {data.report.bureau} · {data.report.applicantName ?? "name not detected"}
            {data.report.dateOfBirth && ` · DOB ${new Date(data.report.dateOfBirth).toLocaleDateString("en-GB")}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
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
          <select
            value={envelope}
            onChange={(e) => setEnvelope(e.target.value as EnvelopeSize)}
            title="Position the recipient's address to show through a window envelope when printed, with fold guides"
            className="rounded-md border border-border bg-panel px-3 py-2 text-sm text-slate-200 hover:border-accent focus:border-accent focus:outline-none"
          >
            <option value="none">Plain layout</option>
            <option value="c5">C5 window envelope</option>
            <option value="dl">DL window envelope</option>
          </select>
          <select
            value={signatureMode}
            onChange={(e) => setSignatureMode(e.target.value as SignatureMode)}
            title="How the letter is signed"
            className="rounded-md border border-border bg-panel px-3 py-2 text-sm text-slate-200 hover:border-accent focus:border-accent focus:outline-none"
          >
            <option value="digital">Typed name (digital attestation)</option>
            <option value="blank">Blank line for wet-ink signature</option>
          </select>
          <button
            onClick={handleExportDispute}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium text-slate-200 hover:border-accent hover:text-accent"
          >
            Export dispute text
          </button>
          <button
            onClick={handleDownloadPdf}
            disabled={downloadingPdf}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium text-slate-200 hover:border-accent hover:text-accent disabled:opacity-50"
          >
            {downloadingPdf ? "Preparing…" : "Download as PDF"}
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
      {envelope === "dl" && (
        <p className="mt-1 text-right text-xs text-warn">
          DL window position is approximate — envelope window placement varies by manufacturer. Fold a spare sheet and check it against
          your own envelope before using this for a time-sensitive letter.
        </p>
      )}

      {selectedTemplate === "notice_of_correction" && (
        <div className="mt-4 rounded-lg border border-accent/40 bg-accent/5 p-4">
          <label htmlFor="correction-statement" className="text-sm font-semibold text-slate-100">
            Your notice of correction statement
          </label>
          <p className="mt-1 text-xs text-slate-400">
            Section 159(3) of the Consumer Credit Act 1974 requires this to be drawn up by you, not generated for you — write it in your
            own words, describing what's wrong and what the entry should say instead. Limit: {NOTICE_OF_CORRECTION_WORD_LIMIT} words.
          </p>
          <textarea
            id="correction-statement"
            value={correctionStatement}
            onChange={(e) => setCorrectionStatement(e.target.value)}
            rows={4}
            placeholder="e.g. This account does not belong to me. I have never held an account with..."
            className="mt-2 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-slate-200 focus:border-accent focus:outline-none"
          />
          <p className={`mt-1 text-right text-xs ${countWords(correctionStatement) > NOTICE_OF_CORRECTION_WORD_LIMIT ? "text-critical" : "text-slate-500"}`}>
            {countWords(correctionStatement)} / {NOTICE_OF_CORRECTION_WORD_LIMIT} words
          </p>
        </div>
      )}

      <div
        className={`mt-4 rounded-lg border px-4 py-3 text-sm ${
          data.identityCheck.overallMatch === false
            ? "border-critical/40 bg-critical/10 text-critical"
            : data.identityCheck.overallMatch === true
              ? "border-good/40 bg-good/10 text-good"
              : "border-border bg-panel text-slate-400"
        }`}
      >
        {data.identityCheck.message}
        {!data.identityCheck.profileConfirmed && (
          <>
            {" "}
            <Link to="/settings" className="underline hover:text-accent">
              Go to Settings
            </Link>
          </>
        )}
      </div>

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
          This app's own transparent estimate from the negative markers below — not Experian/Equifax/TransUnion's real, proprietary
          score, which depends on data this app doesn't have.
        </p>
        <ul className="mt-3 flex flex-col gap-1 text-xs text-slate-400">
          {data.creditScoreEstimate.factors.map((f, i) => (
            <li key={i} className="flex justify-between gap-3">
              <span>{f.label}</span>
              <span className={`tabular-nums ${f.impact < 0 ? "text-critical" : "text-slate-400"}`}>
                {f.impact > 0 ? "+" : ""}
                {f.impact}
              </span>
            </li>
          ))}
        </ul>
      </section>

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

      {comparison && (
        <section className="mt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Progress over time</h2>
          <div className="mt-3">
            <ComparisonPanel comparison={comparison} />
          </div>
        </section>
      )}

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

          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
            <label htmlFor="dispute-recipient" className="text-xs text-slate-400">
              Sent to:
            </label>
            <input
              id="dispute-recipient"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="e.g. the lender's name"
              className="min-w-[220px] flex-1 rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-slate-200 focus:border-accent focus:outline-none"
            />
            <button
              onClick={handleMarkSent}
              disabled={markingSent}
              className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50"
            >
              {markingSent ? "Logging…" : "Mark as sent"}
            </button>
          </div>
        </div>
      )}

      <section className="mt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Disputes sent</h2>
        <p className="mt-1 text-xs text-slate-500">
          Once you've posted or emailed a letter, use "Mark as sent" above to track it here — including when to expect a reply.
        </p>
        <div className="mt-3">
          <DisputeTracker
            disputes={disputes}
            templates={templates}
            onMarkResolved={handleMarkResolved}
            onMarkNoResponse={handleMarkNoResponse}
            onDownloadTrackingSheet={handleDownloadTrackingSheet}
            onDownloadEscalationPack={handleDownloadEscalationPack}
          />
        </div>
      </section>

      <section className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Data-quality alerts</h2>
          {data.alerts.length > 0 && (
            <Link to={`/reports/${id}/inspector`} className="text-xs font-medium text-accent hover:underline">
              Open document inspector →
            </Link>
          )}
        </div>
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
