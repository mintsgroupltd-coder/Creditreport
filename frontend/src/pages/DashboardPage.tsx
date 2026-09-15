import { ChangeEvent, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { ReportSummary } from "../api/types";
import { AppShell } from "../components/AppShell";

export function DashboardPage() {
  const navigate = useNavigate();
  const [reports, setReports] = useState<ReportSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api
      .listReports()
      .then((res) => setReports(res.reports))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load your reports."));
  }, []);

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const result = await api.uploadReport(file);
      navigate(`/reports/${result.reportId}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Upload failed — please try again.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <AppShell>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">Your reports</h1>
          <p className="mt-1 text-sm text-slate-400">Upload a credit report (PDF or CSV) to parse and analyse it.</p>
        </div>
        <label className="cursor-pointer rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent/90">
          {uploading ? "Uploading…" : "Upload report"}
          <input ref={fileInputRef} type="file" accept=".pdf,.csv" onChange={handleFileChange} disabled={uploading} className="hidden" />
        </label>
      </div>

      {error && <p className="mt-4 text-sm text-critical">{error}</p>}

      <div className="mt-8">
        {reports === null && <p className="text-sm text-slate-400">Loading…</p>}
        {reports && reports.length === 0 && (
          <div className="rounded-lg border border-dashed border-border px-6 py-10 text-center text-sm text-slate-400">
            No reports yet — upload a PDF or CSV export from Experian, Equifax or TransUnion to get started.
          </div>
        )}
        {reports && reports.length > 0 && (
          <ul className="flex flex-col gap-3">
            {reports.map((r) => (
              <li key={r.id}>
                <Link
                  to={`/reports/${r.id}`}
                  className="flex items-center justify-between rounded-lg border border-border bg-panel px-5 py-4 hover:border-accent"
                >
                  <div>
                    <div className="text-sm font-medium text-slate-100">{r.sourceFileName}</div>
                    <div className="mt-0.5 text-xs text-slate-400">
                      {r.bureau} · {r.applicantName ?? "name not detected"} · uploaded {new Date(r.uploadedAt).toLocaleDateString("en-GB")}
                    </div>
                  </div>
                  <div className="text-right text-xs text-slate-400">
                    <div>{r._count.accounts} accounts</div>
                    <div>{r._count.alerts} alerts</div>
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
