import { AlertRow } from "../api/types";

const SEVERITY_DOT: Record<string, string> = {
  INFO: "bg-slate-400",
  WARNING: "bg-warn",
  CRITICAL: "bg-critical",
};

const TYPE_LABEL: Record<string, string> = {
  DOB_MISMATCH: "Date of birth mismatch",
  NAME_VARIATION: "Name variation",
  MIXED_FILE_RISK: "Mixed-file risk",
  DUPLICATE_ACCOUNT: "Possible duplicate account",
  HIGH_UTILISATION: "High utilisation",
  UNSATISFIED_CCJ: "Unsatisfied CCJ",
  ACTIVE_DEFAULT: "Active default",
  SEARCH_VOLUME: "Search volume",
};

export function AlertList({ alerts }: { alerts: AlertRow[] }) {
  if (alerts.length === 0) {
    return <p className="text-sm text-slate-400">No alerts were raised for this report.</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {alerts.map((alert) => (
        <li key={alert.id} className="flex gap-3 rounded-lg border border-border bg-panel px-4 py-3">
          <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${SEVERITY_DOT[alert.severity] ?? "bg-slate-400"}`} />
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              {TYPE_LABEL[alert.type] ?? alert.type}
            </div>
            <p className="mt-0.5 text-sm text-slate-200">{alert.message}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
