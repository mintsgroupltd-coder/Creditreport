import { ReportComparison } from "../api/types";

function money(value: number): string {
  return `£${Math.round(value).toLocaleString("en-GB")}`;
}

/** Lower is better for every negative marker here, so a decrease is
 * "good" (green, down arrow) and an increase is "bad" (red/warn, up
 * arrow) — the opposite of a typical dashboard metric. */
function Delta({ before, after, format = (n: number) => String(n) }: { before: number; after: number; format?: (n: number) => string }) {
  const diff = after - before;
  if (diff === 0) return <span className="text-xs text-slate-500">No change</span>;
  const improved = diff < 0;
  return (
    <span className={`text-xs font-medium ${improved ? "text-good" : "text-critical"}`}>
      {improved ? "↓" : "↑"} {format(Math.abs(diff))} {improved ? "better" : "worse"}
    </span>
  );
}

export function ComparisonPanel({ comparison }: { comparison: ReportComparison }) {
  if (!comparison.hasPrevious || !comparison.stats || !comparison.negativeMarkers || !comparison.riskLevel || !comparison.previousReport) {
    return (
      <p className="text-sm text-slate-500">
        This is the only report on file for you so far — upload a newer one later (e.g. after a dispute resolves) to see progress here.
      </p>
    );
  }

  const { previousReport, riskLevel, stats, negativeMarkers } = comparison;
  const rows: { label: string; before: number; after: number; format?: (n: number) => string }[] = [
    { label: "Unsatisfied CCJs", before: negativeMarkers.previous.unsatisfiedCcjCount, after: negativeMarkers.current.unsatisfiedCcjCount },
    { label: "CCJ total", before: negativeMarkers.previous.ccjTotalAmount, after: negativeMarkers.current.ccjTotalAmount, format: money },
    { label: "Active defaults", before: negativeMarkers.previous.activeDefaultCount, after: negativeMarkers.current.activeDefaultCount },
    { label: "Default total", before: negativeMarkers.previous.activeDefaultTotal, after: negativeMarkers.current.activeDefaultTotal, format: money },
    { label: "High-utilisation accounts", before: negativeMarkers.previous.highUtilisationCount, after: negativeMarkers.current.highUtilisationCount },
  ];

  return (
    <div>
      <p className="text-xs text-slate-500">
        Compared to your previous report ({previousReport.bureau}, uploaded {new Date(previousReport.uploadedAt).toLocaleDateString("en-GB")}):
      </p>
      <div className="mt-3 flex items-center gap-3 rounded-lg border border-border bg-panel px-4 py-3">
        <span className="text-xs uppercase tracking-wide text-slate-400">Risk level</span>
        <span className="text-sm text-slate-300">
          {riskLevel.previous} <span className="text-slate-500">→</span> {riskLevel.current}
        </span>
      </div>
      <div className="mt-2 overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[480px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-panel text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="px-4 py-3">Marker</th>
              <th className="px-4 py-3 text-right">Before</th>
              <th className="px-4 py-3 text-right">Now</th>
              <th className="px-4 py-3 text-right">Change</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-b border-border/60 last:border-b-0">
                <td className="px-4 py-3 text-slate-200">{r.label}</td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-400">{(r.format ?? String)(r.before)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-200">{(r.format ?? String)(r.after)}</td>
                <td className="px-4 py-3 text-right">
                  <Delta before={r.before} after={r.after} format={r.format} />
                </td>
              </tr>
            ))}
            <tr>
              <td className="px-4 py-3 text-slate-200">Total accounts</td>
              <td className="px-4 py-3 text-right tabular-nums text-slate-400">{stats.previous.totalAccounts}</td>
              <td className="px-4 py-3 text-right tabular-nums text-slate-200">{stats.current.totalAccounts}</td>
              <td className="px-4 py-3 text-right text-xs text-slate-500">—</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
