import { useState } from "react";
import { ApiError, api } from "../api/client";
import { DisputeRecordRow, DisputeTemplateOption } from "../api/types";

/** The templates addressed to a credit reference agency under CCA 1974
 * s.159 — where a missed statutory deadline means escalation to the ICO
 * (not the Financial Ombudsman Service, which covers a different kind of
 * complaint) becomes available. Mirrors CRA_STATUTORY_TEMPLATES in
 * backend/src/controllers/disputes.controller.ts. */
const CRA_STATUTORY_TEMPLATES = new Set(["auto", "identity", "general_accuracy", "notice_of_correction"]);

function templateLabel(templates: DisputeTemplateOption[], templateId: string): string {
  return templates.find((t) => t.id === templateId)?.label ?? templateId;
}

function daysUntil(iso: string): number {
  const ms = new Date(iso).getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

function DeadlineBadge({ dispute }: { dispute: DisputeRecordRow }) {
  if (!dispute.responseDeadline || dispute.status !== "SENT") return null;
  const days = daysUntil(dispute.responseDeadline);
  const label = dispute.deadlineBasis === "statutory" ? "response window" : "suggested follow-up";
  if (days < 0) {
    return <span className="rounded-full bg-critical/15 px-2 py-0.5 text-xs font-medium text-critical">{Math.abs(days)}d overdue ({label})</span>;
  }
  if (days <= 5) {
    return <span className="rounded-full bg-warn/15 px-2 py-0.5 text-xs font-medium text-warn">{days}d left ({label})</span>;
  }
  return <span className="text-xs text-slate-500">{days}d left ({label})</span>;
}

/** Shown once a statutory CRA deadline has passed on a still-open
 * dispute — the ICO is the correct escalation authority for a section
 * 159 dispute (s.159(5)/(8)), not the Financial Ombudsman Service. */
function EscalationNote({ dispute }: { dispute: DisputeRecordRow }) {
  if (dispute.status !== "SENT" || dispute.deadlineBasis !== "statutory" || !dispute.responseDeadline) return null;
  if (!CRA_STATUTORY_TEMPLATES.has(dispute.templateId)) return null;
  if (daysUntil(dispute.responseDeadline) >= 0) return null;
  return (
    <p className="mt-1 text-xs text-warn">
      This statutory deadline has passed — you may now escalate to the Information Commissioner's Office (ICO) under section 159 of the
      Consumer Credit Act 1974. See "Useful contacts" above for their address.
    </p>
  );
}

/** Passive, purely-derived nudge shown once a dispute's deadline has
 * passed and it hasn't been marked resolved — regardless of whether that
 * deadline was statutory or just a suggested follow-up point, unlike the
 * narrower EscalationNote above (which only covers the specific s.159
 * ICO-escalation case for a still-"SENT" dispute). Never fetches
 * anything itself; it only points at the "Escalation pack" download this
 * component already offers, and only when this template actually has one
 * (see ESCALATION_PACK_TEMPLATES below) — otherwise there's nothing to
 * link to and this stays silent rather than pointing at a 400. Skipped
 * when EscalationNote is already showing the more specific ICO message,
 * so a statutory CRA dispute doesn't get told twice in slightly
 * different words. */
function DeadlinePassedBanner({ dispute, hasEscalationPackLink }: { dispute: DisputeRecordRow; hasEscalationPackLink: boolean }) {
  if (dispute.status === "RESOLVED") return null;
  if (!dispute.responseDeadline || daysUntil(dispute.responseDeadline) >= 0) return null;
  if (!hasEscalationPackLink) return null;
  const coveredByEscalationNote =
    dispute.status === "SENT" && dispute.deadlineBasis === "statutory" && CRA_STATUTORY_TEMPLATES.has(dispute.templateId);
  if (coveredByEscalationNote) return null;
  return <p className="mt-1 text-xs text-warn">Deadline passed — you can download an escalation pack below.</p>;
}

/** Simple, deliberately loose "does this look like an email" check — the
 * backend's zod schema (z.string().email()) is the real validation; this
 * only gates the Send button so a user can't submit an obviously-empty or
 * malformed address, not a substitute for server-side checking. */
function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function StatusPill({ status }: { status: DisputeRecordRow["status"] }) {
  const styles: Record<DisputeRecordRow["status"], string> = {
    SENT: "bg-accent/15 text-accent",
    RESOLVED: "bg-good/15 text-good",
    NO_RESPONSE: "bg-critical/15 text-critical",
  };
  const labels: Record<DisputeRecordRow["status"], string> = {
    SENT: "Sent",
    RESOLVED: "Resolved",
    NO_RESPONSE: "No response",
  };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[status]}`}>{labels[status]}</span>;
}

/** Same three templates as CRA_STATUTORY_TEMPLATES above, plus
 * default_validation — the one advisory template that still has a real
 * escalation route (a conduct complaint to the FOS about the lender). A
 * CCJ dispute has no ICO/FOS route at all (see escalationAuthorityFor in
 * backend/src/controllers/disputes.controller.ts), so it's deliberately
 * left out here. */
const ESCALATION_PACK_TEMPLATES = new Set(["auto", "identity", "general_accuracy", "notice_of_correction", "default_validation"]);

/** Result of the last successful send for a dispute, kept in this
 * component's own state (see `emailSentOverrides` below) rather than
 * relying solely on the `disputes` prop — the parent page owns that array
 * and only refreshes it from its own actions (mark resolved/no response,
 * a fresh `listDisputes` call), so a successful send here needs its own
 * local record to show "Sent to {email} at {time}" immediately without
 * waiting on the parent to re-fetch. A dispute already carrying
 * `emailSentAt` from the server (e.g. after a page reload) is shown the
 * same way, via the merge in `emailStatusFor` below. */
interface EmailSentInfo {
  emailSentAt: string;
  emailSentTo: string;
}

export function DisputeTracker({
  disputes,
  templates,
  onMarkResolved,
  onMarkNoResponse,
  onDownloadTrackingSheet,
  onDownloadEscalationPack,
}: {
  disputes: DisputeRecordRow[];
  templates: DisputeTemplateOption[];
  onMarkResolved: (id: string) => void;
  onMarkNoResponse: (id: string) => void;
  onDownloadTrackingSheet?: (id: string) => void;
  onDownloadEscalationPack?: (id: string) => void;
}) {
  // "Send by email" confirm panel state, keyed by dispute id so multiple
  // rows never fight over one set of fields.
  const [sendPanelOpenId, setSendPanelOpenId] = useState<string | null>(null);
  const [emailDrafts, setEmailDrafts] = useState<Record<string, string>>({});
  const [reviewedChecked, setReviewedChecked] = useState<Record<string, boolean>>({});
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [sendErrors, setSendErrors] = useState<Record<string, string>>({});
  const [emailSentOverrides, setEmailSentOverrides] = useState<Record<string, EmailSentInfo>>({});
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<Record<string, string>>({});
  const [zipDownloadingId, setZipDownloadingId] = useState<string | null>(null);
  const [zipErrors, setZipErrors] = useState<Record<string, string>>({});

  if (disputes.length === 0) {
    return <p className="text-sm text-slate-500">No disputes logged yet for this report — use "Mark as sent" above once you've posted a letter.</p>;
  }

  function emailStatusFor(d: DisputeRecordRow): EmailSentInfo | null {
    if (emailSentOverrides[d.id]) return emailSentOverrides[d.id];
    if (d.emailSentAt) return { emailSentAt: d.emailSentAt, emailSentTo: d.emailSentTo ?? "" };
    return null;
  }

  /** Opens the exact same letter PDF the Send button is about to email,
   * in a new tab, so the user can look at it before ticking the review
   * checkbox — same construction (report id + this dispute's own
   * templateId) as sendDisputeEmail itself uses server-side, and the same
   * Blob/object-URL approach ReportDetailPage.tsx already uses for its
   * own PDF download, just opened for viewing instead of forced download. */
  async function handlePreview(d: DisputeRecordRow) {
    setPreviewingId(d.id);
    setPreviewError((prev) => ({ ...prev, [d.id]: "" }));
    try {
      const blob = await api.downloadDisputePdf(d.reportId, d.templateId);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      // Give the new tab time to load the PDF before releasing the object URL.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      setPreviewError((prev) => ({ ...prev, [d.id]: err instanceof ApiError ? err.message : "Could not open the letter preview." }));
    } finally {
      setPreviewingId(null);
    }
  }

  /** The one explicit-confirm send action itself — only reachable once
   * the recipient is filled in and the review checkbox is ticked (the
   * Send button below is disabled otherwise), and only ever called from
   * that click. See sendDisputeEmail's doc comment in
   * disputes.controller.ts for why this is deliberately never automatic. */
  async function handleSendEmail(d: DisputeRecordRow) {
    const to = (emailDrafts[d.id] ?? "").trim();
    if (!looksLikeEmail(to) || !reviewedChecked[d.id]) return;
    setSendingId(d.id);
    setSendErrors((prev) => ({ ...prev, [d.id]: "" }));
    try {
      const updated = await api.sendDisputeEmail(d.id, { to, templateId: d.templateId });
      setEmailSentOverrides((prev) => ({
        ...prev,
        [d.id]: { emailSentAt: updated.emailSentAt ?? new Date().toISOString(), emailSentTo: updated.emailSentTo ?? to },
      }));
      setSendPanelOpenId(null);
    } catch (err) {
      setSendErrors((prev) => ({ ...prev, [d.id]: err instanceof ApiError ? err.message : "Could not send this email." }));
    } finally {
      setSendingId(null);
    }
  }

  async function handleDownloadPackZip(d: DisputeRecordRow) {
    setZipDownloadingId(d.id);
    setZipErrors((prev) => ({ ...prev, [d.id]: "" }));
    try {
      const blob = await api.downloadDisputePackZip(d.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `dispute-pack-${d.id}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setZipErrors((prev) => ({ ...prev, [d.id]: err instanceof ApiError ? err.message : "Could not build the dispute pack." }));
    } finally {
      setZipDownloadingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {disputes.map((d) => {
        const emailStatus = emailStatusFor(d);
        const sendPanelOpen = sendPanelOpenId === d.id;
        const draftEmail = emailDrafts[d.id] ?? "";
        const draftReviewed = reviewedChecked[d.id] ?? false;
        return (
          <div key={d.id} className="rounded-lg border border-border bg-panel px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm text-slate-200">
                  {templateLabel(templates, d.templateId)} <span className="text-slate-500">→</span> {d.recipient}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">Sent {new Date(d.sentAt).toLocaleDateString("en-GB")}</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <DeadlineBadge dispute={d} />
                <StatusPill status={d.status} />
                {onDownloadTrackingSheet && (
                  <button
                    onClick={() => onDownloadTrackingSheet(d.id)}
                    title="A plain, unbranded sheet to note how this letter was posted, plus its milestone dates"
                    className="rounded-md border border-border px-2 py-1 text-xs text-slate-300 hover:border-accent hover:text-accent"
                  >
                    Tracking sheet
                  </button>
                )}
                {onDownloadEscalationPack && ESCALATION_PACK_TEMPLATES.has(d.templateId) && (
                  <button
                    onClick={() => onDownloadEscalationPack(d.id)}
                    title="A bundled PDF: case summary, the letter as sent, and the ICO or FOS's contact details with dated milestones"
                    className="rounded-md border border-border px-2 py-1 text-xs text-slate-300 hover:border-accent hover:text-accent"
                  >
                    Escalation pack
                  </button>
                )}
                <button
                  onClick={() => handleDownloadPackZip(d)}
                  disabled={zipDownloadingId === d.id}
                  title="Letter, escalation pack (if this template has one), tracking sheet and a README, all in one zip"
                  className="rounded-md border border-border px-2 py-1 text-xs text-slate-300 hover:border-accent hover:text-accent disabled:opacity-50"
                >
                  {zipDownloadingId === d.id ? "Building…" : "Download pack (.zip)"}
                </button>
                <button
                  onClick={() => setSendPanelOpenId(sendPanelOpen ? null : d.id)}
                  title="Email this letter yourself, after reviewing it — never sent automatically"
                  className="rounded-md border border-border px-2 py-1 text-xs text-slate-300 hover:border-accent hover:text-accent"
                >
                  Send by email
                </button>
                {d.status === "SENT" && (
                  <div className="flex items-center gap-1">
                    <button onClick={() => onMarkResolved(d.id)} className="rounded-md border border-border px-2 py-1 text-xs text-slate-300 hover:border-good hover:text-good">
                      Mark resolved
                    </button>
                    <button onClick={() => onMarkNoResponse(d.id)} className="rounded-md border border-border px-2 py-1 text-xs text-slate-300 hover:border-critical hover:text-critical">
                      No response
                    </button>
                  </div>
                )}
              </div>
            </div>
            <EscalationNote dispute={d} />
            <DeadlinePassedBanner dispute={d} hasEscalationPackLink={Boolean(onDownloadEscalationPack) && ESCALATION_PACK_TEMPLATES.has(d.templateId)} />
            {zipErrors[d.id] && <p className="mt-1 text-xs text-critical">{zipErrors[d.id]}</p>}
            {emailStatus && (
              <p className="mt-1 text-xs text-good">
                Sent to {emailStatus.emailSentTo} at {new Date(emailStatus.emailSentAt).toLocaleString("en-GB")}
              </p>
            )}
            {sendPanelOpen && (
              <div className="mt-3 rounded-md border border-border bg-surface p-3">
                <p className="text-xs font-medium text-slate-200">Send this dispute letter by email</p>
                <p className="mt-1 text-xs text-slate-500">
                  This sends right away, from your own account, to the address you type below — nothing is sent automatically. Review the exact
                  letter first.
                </p>
                <button
                  onClick={() => handlePreview(d)}
                  disabled={previewingId === d.id}
                  className="mt-2 text-xs font-medium text-accent hover:underline disabled:opacity-50"
                >
                  {previewingId === d.id ? "Opening…" : "Preview the letter (opens in a new tab)"}
                </button>
                {previewError[d.id] && <p className="mt-1 text-xs text-critical">{previewError[d.id]}</p>}
                <label className="mt-3 block text-xs text-slate-400">
                  Recipient email
                  <input
                    type="email"
                    value={draftEmail}
                    onChange={(e) => setEmailDrafts((prev) => ({ ...prev, [d.id]: e.target.value }))}
                    placeholder="you@example.com"
                    className="mt-1 w-full rounded-md border border-border bg-panel px-2 py-1 text-sm text-slate-100 focus:border-accent focus:outline-none"
                  />
                </label>
                <label className="mt-3 flex items-start gap-2 text-xs text-slate-300">
                  <input
                    type="checkbox"
                    checked={draftReviewed}
                    onChange={(e) => setReviewedChecked((prev) => ({ ...prev, [d.id]: e.target.checked }))}
                    className="mt-0.5"
                  />
                  I have reviewed this letter and want to send it now
                </label>
                {sendErrors[d.id] && <p className="mt-2 text-xs text-critical">{sendErrors[d.id]}</p>}
                <div className="mt-3 flex items-center gap-2">
                  <button
                    onClick={() => handleSendEmail(d)}
                    disabled={!looksLikeEmail(draftEmail) || !draftReviewed || sendingId === d.id}
                    className="rounded-md bg-accent px-3 py-1 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {sendingId === d.id ? "Sending…" : "Send"}
                  </button>
                  <button
                    onClick={() => setSendPanelOpenId(null)}
                    className="rounded-md border border-border px-3 py-1 text-xs text-slate-300 hover:border-accent hover:text-accent"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
