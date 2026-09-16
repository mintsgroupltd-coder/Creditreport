const STYLES: Record<string, string> = {
  LOW: "bg-good/15 text-good border-good/30",
  MEDIUM: "bg-warn/15 text-warn border-warn/30",
  HIGH: "bg-critical/15 text-critical border-critical/30",
  SEVERE: "bg-critical/25 text-critical border-critical/50",
  INFO: "bg-slate-500/15 text-slate-300 border-slate-500/30",
  WARNING: "bg-warn/15 text-warn border-warn/30",
  CRITICAL: "bg-critical/15 text-critical border-critical/30",
};

export function RiskBadge({ label }: { label: string }) {
  const style = STYLES[label] ?? "bg-slate-500/15 text-slate-300 border-slate-500/30";
  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold tracking-wide ${style}`}>
      {label}
    </span>
  );
}
