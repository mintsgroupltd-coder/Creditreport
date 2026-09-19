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

export function DisputeTracker({
  disputes,
  templates,
  onMarkResolved,
  onMarkNoResponse,
  onDownloadTrackingSheet,
}: {
  disputes: DisputeRecordRow[];
  templates: DisputeTemplateOption[];
  onMarkResolved: (id: string) => void;
  onMarkNoResponse: (id: string) => void;
  onDownloadTrackingSheet?: (id: string) => void;
}) {
  if (disputes.length === 0) {
    return <p className="text-sm text-slate-500">No disputes logged yet for this report — use "Mark as sent" above once you've posted a letter.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {disputes.map((d) => (
        <div key={d.id} className="rounded-lg border border-border bg-panel px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm text-slate-200">
                {templateLabel(templates, d.templateId)} <span className="text-slate-500">→</span> {d.recipient}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">Sent {new Date(d.sentAt).toLocaleDateString("en-GB")}</p>
            </div>
            <div className="flex items-center gap-3">
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
        </div>
      ))}
    </div>
  );
}
