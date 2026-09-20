import { FileText, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { ReportSummary } from "../api/types";
import { AppShell } from "../components/AppShell";
import { ReportUploadForm } from "../components/ReportUploadForm";

export function DashboardPage() {
  const navigate = useNavigate();
  const [reports, setReports] = useState<ReportSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listReports()
      .then((res) => setReports(res.reports))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load your reports."));
  }, []);

  return (
    <AppShell>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">Your reports</h1>
          <p className="mt-1 text-sm text-slate-400">Upload a credit report (PDF or CSV) to parse and analyse it.</p>
        </div>
        <ReportUploadForm onUploaded={() => navigate("/remediate/2")} onError={setError} />
      </div>

      {error && <p className="mt-4 text-sm text-critical">{error}</p>}

      <Link
        to="/remediate/1"
        className="mt-6 flex items-center gap-4 rounded-xl border border-accent/40 bg-accent/10 p-5 hover:border-accent"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/20 text-accent">
          <Sparkles className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <div className="text-sm font-semibold text-slate-100">New here? Follow the guided flow</div>
          <p className="mt-0.5 text-sm text-slate-400">
            Upload → audit → reconcile across bureaus → dispute → track — five steps through the tools below, in order.
          </p>
        </div>
      </Link>

      <div className="mt-8">
        {reports === null && <p className="text-sm text-slate-400">Loading…</p>}
        {reports && reports.length === 0 && (
          <div className="rounded-xl border border-dashed border-border px-6 py-10 text-center text-sm text-slate-400">
            No reports yet — upload a PDF or CSV export from Experian, Equifax or TransUnion to get started.
          </div>
        )}
        {reports && reports.length > 0 && (
          <ul className="flex flex-col gap-3">
            {reports.map((r) => (
              <li key={r.id}>
                <Link
                  to={`/reports/${r.id}`}
                  className="group flex items-center gap-4 rounded-xl border border-border bg-panel px-5 py-4 hover:border-accent"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-slate-400 group-hover:text-accent">
                    <FileText className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div className="flex flex-1 items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-100 group-hover:text-accent">{r.sourceFileName}</span>
                        {r.isSample && (
                          <span
                            title="Fictional fixture data, not a real credit report"
                            className="rounded-full bg-warn/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warn"
                          >
                            Sample data
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 text-xs text-slate-400">
                        {r.bureau} · {r.applicantName ?? "name not detected"} · uploaded {new Date(r.uploadedAt).toLocaleDateString("en-GB")}
                      </div>
                    </div>
                    <div className="shrink-0 text-right text-xs text-slate-400">
                      <div>{r._count.accounts} accounts</div>
                      <div>{r._count.alerts} alerts</div>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
