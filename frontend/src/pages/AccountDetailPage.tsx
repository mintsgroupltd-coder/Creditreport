import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { AccountDetail } from "../api/types";
import { AccountTimeline } from "../components/AccountTimeline";
import { AppShell } from "../components/AppShell";
import { BalanceChart } from "../components/BalanceChart";
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
  const [contactAddress, setContactAddress] = useState("");
  const [savingContact, setSavingContact] = useState(false);
  const [contactSaved, setContactSaved] = useState(false);

  useEffect(() => {
    if (!id) return;
    api
      .getAccount(id)
      .then((res) => {
        setData(res);
        setContactAddress(res.account.lenderContactAddress ?? "");
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load this account."));
  }, [id]);

  async function handleSaveContact() {
    if (!id) return;
    setSavingContact(true);
    setContactSaved(false);
    try {
      const trimmed = contactAddress.trim();
      const res = await api.updateLenderContact(id, trimmed.length > 0 ? trimmed : null);
      setData((prev) => (prev ? { ...prev, account: { ...prev.account, lenderContactAddress: res.contactAddress } } : prev));
      setContactSaved(true);
      setTimeout(() => setContactSaved(false), 2000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save this address.");
    } finally {
      setSavingContact(false);
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

      <section className="mt-8 rounded-lg border border-border bg-panel p-5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Lender / agent contact address</h2>
        <p className="mt-1 text-xs text-slate-500">
          Add this lender's postal address so it's ready to use when you write to them directly (for example, if a debt has been
          passed to a collection agency, use the agency's address, not the original lender's). Use the address from your most
          recent statement or letter — this is shared across every account for {account.lenderName} on your reports.
        </p>
        <textarea
          value={contactAddress}
          onChange={(e) => setContactAddress(e.target.value)}
          rows={4}
          placeholder={`e.g.\n${account.lenderName}\nPO Box 123\nAnytown\nAB1 2CD`}
          className="mt-3 w-full rounded-md border border-border bg-ink px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-accent focus:outline-none"
        />
        <div className="mt-2 flex items-center gap-3">
          <button
            onClick={handleSaveContact}
            disabled={savingContact}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium text-slate-200 hover:border-accent hover:text-accent disabled:opacity-50"
          >
            {savingContact ? "Saving…" : "Save address"}
          </button>
          {contactSaved && <span className="text-xs text-good">Saved.</span>}
        </div>
      </section>

      <section className="mt-8 rounded-lg border border-border bg-panel p-5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Balance over time</h2>
        <div className="mt-4">
          <BalanceChart
            points={timeline
              .filter((p) => p.kind === "STATUS" && p.balance !== null && p.balance !== undefined)
              .map((p) => ({ date: p.date, balance: Number(p.balance) }))}
          />
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Timeline</h2>
        <div className="mt-4">
          <AccountTimeline points={timeline} />
        </div>
      </section>
    </AppShell>
  );
}
