import { useEffect, useMemo, useRef, useState } from "react";
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

type SortKey = "lender" | "balance";

function money(value: string | null): string {
  if (value === null || value === undefined) return "—";
  const n = Number(value);
  return Number.isFinite(n) ? `£${n.toLocaleString("en-GB")}` : "—";
}

/** `focusAccountId`, when set, comes from a deep link (e.g. the
 * reconciliation table's "Dispute this" links via ReportDetailPage.tsx's
 * `?focusAccountId=` query param) — the matching row scrolls into view
 * and gets a temporary highlight ring so it's easy to find among
 * potentially dozens of accounts, without needing its own search/filter
 * step first. */
export function AccountTable({ accounts, focusAccountId }: { accounts: AccountRow[]; focusAccountId?: string | null }) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("lender");
  const [sortDesc, setSortDesc] = useState(false);
  const focusRowRef = useRef<HTMLTableRowElement | null>(null);

  useEffect(() => {
    if (focusAccountId && focusRowRef.current) {
      focusRowRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [focusAccountId]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? accounts.filter((a) => a.lenderName.toLowerCase().includes(q) || a.accountType.toLowerCase().includes(q))
      : accounts;

    const sorted = [...filtered].sort((a, b) => {
      if (sortKey === "balance") {
        return (Number(a.currentBalance ?? 0) || 0) - (Number(b.currentBalance ?? 0) || 0);
      }
      return a.lenderName.localeCompare(b.lenderName);
    });
    return sortDesc ? sorted.reverse() : sorted;
  }, [accounts, query, sortKey, sortDesc]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDesc((d) => !d);
    else {
      setSortKey(key);
      setSortDesc(false);
    }
  }

  return (
    <div>
      <div className="mb-3 flex items-center gap-3">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by lender or account type…"
          className="w-full max-w-xs rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-slate-200 placeholder:text-slate-500 focus:border-accent focus:outline-none sm:w-64"
        />
        {query && (
          <span className="text-xs text-slate-500">
            {visible.length} of {accounts.length}
          </span>
        )}
      </div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-panel text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="px-4 py-3">
                <button type="button" onClick={() => toggleSort("lender")} className="hover:text-accent">
                  Lender {sortKey === "lender" && (sortDesc ? "▲" : "▼")}
                </button>
              </th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">
                <button type="button" onClick={() => toggleSort("balance")} className="hover:text-accent">
                  Balance {sortKey === "balance" && (sortDesc ? "▲" : "▼")}
                </button>
              </th>
              <th className="px-4 py-3 text-right">Limit</th>
              <th className="px-4 py-3">Default date</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-sm text-slate-400">
                  No accounts match "{query}".
                </td>
              </tr>
            )}
            {visible.map((a) => (
              <tr
                key={a.id}
                ref={a.id === focusAccountId ? focusRowRef : undefined}
                className={`border-b border-border/60 last:border-0 hover:bg-panel/60 ${
                  a.id === focusAccountId ? "bg-accent/10 ring-1 ring-inset ring-accent" : ""
                }`}
              >
                <td className="px-4 py-3">
                  <Link to={`/accounts/${a.id}`} className="font-medium text-slate-100 hover:text-accent hover:underline">
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
    </div>
  );
}
