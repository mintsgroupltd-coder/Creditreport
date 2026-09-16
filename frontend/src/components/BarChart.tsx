export interface BarDatum {
  label: string;
  value: number;
  colorClass: string; // Tailwind background class, e.g. "bg-critical"
}

/**
 * A minimal horizontal bar chart built from flex/width percentages rather
 * than SVG — bars are categorical counts (alerts by severity, accounts by
 * status), so a proportional-width bar reads as clearly as an SVG one
 * without the extra viewBox/scaling code, and it reflows naturally at
 * phone width.
 */
export function BarChart({ data, emptyLabel }: { data: BarDatum[]; emptyLabel?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const total = data.reduce((sum, d) => sum + d.value, 0);

  if (total === 0) {
    return <p className="text-sm text-slate-400">{emptyLabel ?? "No data to show yet."}</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {data.map((d) => (
        <div key={d.label} className="flex items-center gap-3">
          <div className="w-32 shrink-0 text-xs text-slate-400">{d.label}</div>
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-border/60">
            <div
              className={`h-full rounded-full ${d.colorClass}`}
              style={{ width: `${d.value === 0 ? 0 : Math.max(4, (d.value / max) * 100)}%` }}
            />
          </div>
          <div className="w-6 shrink-0 text-right text-xs font-medium tabular-nums text-slate-300">{d.value}</div>
        </div>
      ))}
    </div>
  );
}
