import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { AccountDetail } from "../api/types";
import { AccountTimeline } from "../components/AccountTimeline";
import { AppShell } from "../components/AppShell";
import { StatCard } from "../components/StatCard";

function money(value: string | null): string {
  if (value === null || value === undefined) return "—";
  const n = Number(value);
  return Number.isFinite(n) ? `£${n.toLocaleString("en-GB")}` : "—";
}

export function AccountDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<AccountDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api
      .getAccount(id)
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load this account."));
  }, [id]);

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

  const { account, timeline } = data;

  return (
    <AppShell>
      <Link to=".." relative="path" className="text-xs text-slate-400 hover:text-accent">
        ← Back to report
      </Link>

      <div className="mt-3 flex items-center gap-3">
        <h1 className="text-xl font-semibold text-slate-100">{account.lenderName}</h1>
        {account.bureauRef && <span className="text-xs text-slate-500">{account.bureauRef}</span>}
      </div>
      <p className="mt-1 text-sm text-slate-400">
        {account.accountType} · opened {account.openedDate ? new Date(account.openedDate).toLocaleDateString("en-GB") : "unknown"}
      </p>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Status" value={account.status} tone={account.status === "DEFAULT" ? "critical" : "default"} />
        <StatCard label="Current balance" value={money(account.currentBalance)} />
        <StatCard label="Credit limit" value={money(account.creditLimit)} />
        <StatCard label="Default balance" value={money(account.defaultBalance)} tone={account.defaultBalance ? "critical" : "default"} />
      </div>

      {account.linkedAddress && (
        <p className="mt-4 text-sm text-slate-400">
          Recorded against: <span className="text-slate-300">{account.linkedAddress}</span>
        </p>
      )}

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Timeline</h2>
        <div className="mt-4">
          <AccountTimeline points={timeline} />
        </div>
      </section>
    </AppShell>
  );
}
