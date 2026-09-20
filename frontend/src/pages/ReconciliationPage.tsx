import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { ReconciliationBureauKey, ReconciliationResponse } from "../api/types";
import { AppShell } from "../components/AppShell";

const STATUS_STYLE: Record<string, string> = {
  ACTIVE: "text-slate-200",
  SETTLED: "text-good",
  SATISFIED: "text-good",
  DEFAULT: "text-critical",
  CLOSED: "text-slate-400",
  UNKNOWN: "text-slate-400",
};

function money(value: number | null): string {
  if (value === null) return "—";
  return `£${Math.round(value).toLocaleString("en-GB")}`;
}

function percent(value: number | null): string {
  if (value === null) return "—";
  return `${Math.round(value * 100)}%`;
}

export function ReconciliationPage() {
  const [data, setData] = useState<ReconciliationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloadingCsv, setDownloadingCsv] = useState(false);
  const [csvError, setCsvError] = useState<string | null>(null);

  useEffect(() => {
    api.getReconciliation().then(setData).catch((err) => setError(err instanceof ApiError ? err.message : "Could not load the reconciliation view."));
  }, []);

  async function handleDownloadCsv() {
    setDownloadingCsv(true);
    setCsvError(null);
    try {
      const blob = await api.exportReconciliationCsv();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "reconciliation.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setCsvError(err instanceof ApiError ? err.message : "Could not export the CSV.");
    } finally {
      setDownloadingCsv(false);
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

  const bureausAvailable: ReconciliationBureauKey[] = data.bureausIncluded.map((b) => b.bureau);

  return (
    <AppShell>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">Tri-bureau reconciliation</h1>
          <p className="mt-1 text-sm text-slate-400">
            Compares your most recently uploaded real report from each bureau, side by side, to flag anything reported inconsistently
            between them.
          </p>
        </div>
        {data.eligible && (
          <div className="flex shrink-0 gap-2 print:hidden">
            <button
              onClick={handleDownloadCsv}
              disabled={downloadingCsv}
              className="rounded-md border border-border px-3 py-1.5 text-xs text-slate-300 hover:border-accent hover:text-accent disabled:opacity-60"
            >
              {downloadingCsv ? "Preparing…" : "Download CSV"}
            </button>
            <button
              onClick={() => window.print()}
              className="rounded-md border border-border px-3 py-1.5 text-xs text-slate-300 hover:border-accent hover:text-accent"
            >
              Print summary
            </button>
          </div>
        )}
      </div>
      {csvError && <p className="mt-2 text-xs text-critical print:hidden">{csvError}</p>}

      {data.bureausIncluded.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-3 print:hidden">
          {data.bureausIncluded.map((b) => (
            <Link
              key={b.bureau}
              to={`/reports/${b.reportId}`}
              className="rounded-lg border border-border bg-panel px-3 py-2 text-xs text-slate-300 hover:border-accent hover:text-accent"
            >
              <span className="font-semibold">{b.bureau}</span> · {b.sourceFileName} · uploaded {new Date(b.uploadedAt).toLocaleDateString("en-GB")}
            </Link>
          ))}
        </div>
      )}

      {!data.eligible && (
        <div className="mt-6 rounded-lg border border-dashed border-border px-6 py-10 text-center text-sm text-slate-400">{data.message}</div>
      )}

      {data.eligible && (
        <>
          <p className="mt-6 text-xs text-slate-500">
            {data.discrepancyCount === 0
              ? "No discrepancies found between the bureaus included above."
              : `${data.discrepancyCount} discrepanc${data.discrepancyCount === 1 ? "y" : "ies"} found — flagged rows are listed first.`}{" "}
            "Not reported" only means it's absent from that bureau's most recently uploaded file — it may have been furnished after that
            upload, or removed since, rather than genuinely never reported.
          </p>

          <div className="mt-3 overflow-x-auto rounded-lg border border-border print:overflow-visible print:border-0">
            <table className="w-full min-w-[720px] border-collapse text-sm print:min-w-0 print:text-xs">
              <thead>
                <tr className="border-b border-border bg-panel text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-3">Lender</th>
                  <th className="px-4 py-3">Type</th>
                  {bureausAvailable.map((b) => (
                    <th key={b} className="px-4 py-3">
                      {b}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 && (
                  <tr>
                    <td colSpan={2 + bureausAvailable.length} className="px-4 py-6 text-center text-sm text-slate-400">
                      No accounts found on either report.
                    </td>
                  </tr>
                )}
                {data.rows.map((row) => (
                  <tr
                    key={row.key}
                    className={`border-b border-border/60 last:border-0 ${row.discrepancies.length > 0 ? "bg-critical/5" : ""}`}
                  >
                    <td className={`px-4 py-3 font-medium text-slate-100 ${row.discrepancies.length > 0 ? "border-l-2 border-critical" : ""}`}>
                      {row.lenderName}
                    </td>
                    <td className="px-4 py-3 text-slate-300">{row.accountType}</td>
                    {bureausAvailable.map((b) => {
                      const cell = row.cells[b];
                      return (
                        <td key={b} className="px-4 py-3 align-top">
                          {cell ? (
                            <>
                              <Link to={`/accounts/${cell.accountId}`} className="hover:underline print:pointer-events-none print:text-inherit">
                                <span className={`block font-medium ${STATUS_STYLE[cell.status] ?? "text-slate-300"}`}>{cell.status}</span>
                                <span className="text-xs text-slate-400">{money(cell.currentBalance)}</span>
                                {cell.debtToLimitRatio !== null && (
                                  <span className="block text-xs text-slate-500">{percent(cell.debtToLimitRatio)} of limit</span>
                                )}
                              </Link>
                              {row.discrepancies.length > 0 && (
                                <Link
                                  to={`/reports/${cell.reportId}?template=general_accuracy&focusAccountId=${cell.accountId}`}
                                  className="mt-1.5 inline-block rounded-full border border-critical/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-critical hover:bg-critical/10 print:hidden"
                                >
                                  Dispute this
                                </Link>
                              )}
                            </>
                          ) : (
                            <span className="text-xs text-slate-500">Not reported</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {data.rows.some((r) => r.discrepancies.length > 0) && (
            <div className="mt-6">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Discrepancy detail</h2>
              <div className="mt-3 flex flex-col gap-3">
                {data.rows
                  .filter((r) => r.discrepancies.length > 0)
                  .map((row) => (
                    <div key={row.key} className="rounded-lg border border-critical/30 bg-critical/5 px-4 py-3">
                      <p className="text-sm font-medium text-slate-100">
                        {row.lenderName} <span className="text-slate-500">·</span> {row.accountType}
                      </p>
                      <ul className="mt-1 flex flex-col gap-1">
                        {row.discrepancies.map((d, i) => (
                          <li key={i} className="text-xs text-slate-300">
                            {d}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}
