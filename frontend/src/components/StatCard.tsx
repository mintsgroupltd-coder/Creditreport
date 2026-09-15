export function StatCard({ label, value, tone = "default" }: { label: string; value: string | number; tone?: "default" | "good" | "warn" | "critical" }) {
  const toneClass = {
    default: "text-slate-100",
    good: "text-good",
    warn: "text-warn",
    critical: "text-critical",
  }[tone];

  return (
    <div className="rounded-lg border border-border bg-panel px-5 py-4">
      <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${toneClass}`}>{value}</div>
    </div>
  );
}
