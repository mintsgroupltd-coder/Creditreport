import { Link } from "react-router-dom";
import { AccountRow } from "../api/types";

const STATUS_STYLE: Record<string, string> = {
  ACTIVE: "text-slate-200",
  SETTLED: "text-good",
  SATISFIED: "text-good",
  DEFAULT: "text-critical",
  CLOSED: "text-slate-400",
  UNKNOWN: "text-slate-400",
};

function money(value: string | null): string {
  if (value === null || value === undefined) return "—";
  const n = Number(value);
  return Number.isFinite(n) ? `£${n.toLocaleString("en-GB")}` : "—";
}

export function AccountTable({ accounts }: { accounts: AccountRow[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-panel text-left text-xs uppercase tracking-wide text-slate-400">
            <th className="px-4 py-3">Lender</th>
            <th className="px-4 py-3">Type</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3 text-right">Balance</th>
            <th className="px-4 py-3 text-right">Limit</th>
            <th className="px-4 py-3">Default date</th>
          </tr>
        </thead>
        <tbody>
          {accounts.map((a) => (
            <tr key={a.id} className="border-b border-border/60 last:border-0 hover:bg-panel/60">
              <td className="px-4 py-3">
                <Link to={`/accounts/${a.id}`} className="font-medium text-slate-100 hover:text-accent">
                  {a.lenderName}
                </Link>
                {a.bureauRef && <span className="ml-2 text-xs text-slate-500">{a.bureauRef}</span>}
              </td>
              <td className="px-4 py-3 text-slate-300">{a.accountType}</td>
              <td className={`px-4 py-3 font-medium ${STATUS_STYLE[a.status] ?? "text-slate-300"}`}>{a.status}</td>
              <td className="px-4 py-3 text-right tabular-nums text-slate-200">{money(a.currentBalance)}</td>
              <td className="px-4 py-3 text-right tabular-nums text-slate-400">{money(a.creditLimit)}</td>
              <td className="px-4 py-3 text-slate-400">{a.defaultDate ? new Date(a.defaultDate).toLocaleDateString("en-GB") : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
