import { TimelinePoint } from "../api/types";

const EVENT_LABEL: Record<string, string> = {
  DEFAULT: "Defaulted",
  ARREARS: "Arrears recorded",
  CCJ: "County Court Judgment",
  SEARCH: "Search/enquiry",
  ELECTORAL_ROLL: "Electoral roll entry",
  LINKED_ADDRESS: "Linked address",
};

function money(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? `£${n.toLocaleString("en-GB")}` : null;
}

/** Vertical timeline: monthly balance/status points and dated events, already sorted by date from the API. */
export function AccountTimeline({ points }: { points: TimelinePoint[] }) {
  if (points.length === 0) {
    return <p className="text-sm text-slate-400">No monthly history or events were recorded for this account.</p>;
  }

  return (
    <ol className="relative ml-2 flex flex-col gap-4 border-l border-border pl-6">
      {points.map((p, i) => {
        const date = new Date(p.date).toLocaleDateString("en-GB", { year: "numeric", month: "short" });
        const isEvent = p.kind === "EVENT";
        return (
          <li key={`${p.date}-${i}`} className="relative">
            <span
              className={`absolute -left-[29px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-surface ${
                isEvent ? "bg-critical" : "bg-accent"
              }`}
            />
            <div className="text-xs text-slate-500">{date}</div>
            {isEvent ? (
              <div className="text-sm text-slate-200">
                <span className="font-medium">{EVENT_LABEL[p.type ?? ""] ?? p.type}</span>
                {money(p.amount) && <span className="ml-2 tabular-nums text-slate-400">{money(p.amount)}</span>}
              </div>
            ) : (
              <div className="text-sm text-slate-300">
                Status <span className="font-mono">{p.statusCode}</span>
                {money(p.balance) && <span className="ml-2 tabular-nums text-slate-400">{money(p.balance)}</span>}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
