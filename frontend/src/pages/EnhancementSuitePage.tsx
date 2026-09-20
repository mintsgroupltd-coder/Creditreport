import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { NOTICE_OF_CORRECTION_WORD_LIMIT, ReportDetail, ReportSummary } from "../api/types";
import { AppShell } from "../components/AppShell";

/** Every tool on this page is a client-side calculator or a display of
 * figures the backend already computed — none of it is financial or
 * legal advice, and none of it is a real lending decision. Reused on
 * each tool so the caution reads consistently across the page (matches
 * disputeTextGenerator.ts's own care never to overstate what a notice of
 * correction is). */
function EstimateDisclaimer({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 text-xs text-slate-500">{children}</p>;
}

/** ---- Debt payoff simulation (snowball vs. avalanche) ----
 * Pure, deterministic and capped so a pathological input (e.g. a £0
 * budget) can never loop forever — see MAX_PAYOFF_MONTHS. */
export const MAX_PAYOFF_MONTHS = 600; // 50 years

export interface DebtPayoffAccount {
  id: string;
  lenderName: string;
  balance: number;
  aprPercent: number; // 0 = no interest assumed for this account
}

export type PayoffStrategy = "snowball" | "avalanche";

function orderForStrategy(accounts: DebtPayoffAccount[], strategy: PayoffStrategy): DebtPayoffAccount[] {
  const sorted = [...accounts];
  if (strategy === "avalanche") {
    // Highest APR first; falls back to smallest-balance-first when APRs are equal (including all blank/0).
    sorted.sort((a, b) => b.aprPercent - a.aprPercent || a.balance - b.balance);
  } else {
    sorted.sort((a, b) => a.balance - b.balance);
  }
  return sorted;
}

/** Simulates paying these debts off month by month: the whole monthly
 * budget goes to the single top-priority remaining debt until it's
 * cleared, then rolls to the next one (no separate "minimums" modelled,
 * since credit reports don't carry minimum-payment figures). Interest
 * accrues monthly on any account with a non-zero APR. Capped at
 * MAX_PAYOFF_MONTHS — a result with months >= MAX_PAYOFF_MONTHS means
 * the budget wasn't enough to clear the debts within 50 years. */
export function simulateDebtPayoff(
  accounts: DebtPayoffAccount[],
  strategy: PayoffStrategy,
  monthlyBudget: number
): { months: number; totalInterest: number; order: string[] } {
  const order = orderForStrategy(accounts, strategy);
  if (order.length === 0) return { months: 0, totalInterest: 0, order: [] };

  const balances = new Map(order.map((a) => [a.id, a.balance]));
  let totalInterest = 0;
  let months = 0;

  while (months < MAX_PAYOFF_MONTHS) {
    const remaining = order.filter((a) => (balances.get(a.id) ?? 0) > 0.005);
    if (remaining.length === 0) break;
    months++;

    for (const a of remaining) {
      if (a.aprPercent > 0) {
        const interest = (balances.get(a.id)! * (a.aprPercent / 100)) / 12;
        totalInterest += interest;
        balances.set(a.id, balances.get(a.id)! + interest);
      }
    }

    let budgetLeft = Math.max(0, monthlyBudget);
    for (const a of remaining) {
      if (budgetLeft <= 0) break;
      const bal = balances.get(a.id)!;
      const payment = Math.min(bal, budgetLeft);
      balances.set(a.id, bal - payment);
      budgetLeft -= payment;
    }
  }

  return { months, totalInterest, order: order.map((a) => a.lenderName) };
}

/** ---- Mortgage / loan affordability estimate ----
 * A simplified debt-to-income calculation only — not a real
 * affordability assessment from any lender. */
export const AFFORDABILITY_INCOME_MULTIPLES = [3, 4, 4.5];
export const AFFORDABILITY_SOFT_DTI_PERCENT = 36;
export const AFFORDABILITY_HARD_DTI_PERCENT = 43;

export interface AffordabilityBand {
  multiple: number;
  loanAmount: number;
  estimatedMonthlyPayment: number;
  dtiPercent: number;
  band: "within" | "above-soft" | "above-hard";
}

/** Standard repayment-mortgage amortisation formula for the estimated
 * monthly payment at each illustrative loan amount, then DTI = (existing
 * monthly debt + that payment) / (gross annual income / 12). */
export function estimateAffordability(
  grossAnnualIncome: number,
  existingMonthlyDebt: number,
  assumedAnnualRatePercent: number,
  termYears: number,
  multiples: number[] = AFFORDABILITY_INCOME_MULTIPLES
): AffordabilityBand[] {
  const monthlyIncome = grossAnnualIncome / 12;
  const monthlyRate = assumedAnnualRatePercent / 100 / 12;
  const n = termYears * 12;

  return multiples.map((multiple) => {
    const loanAmount = multiple * grossAnnualIncome;
    const estimatedMonthlyPayment =
      monthlyRate > 0 ? (loanAmount * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -n)) : n > 0 ? loanAmount / n : 0;
    const totalMonthly = existingMonthlyDebt + estimatedMonthlyPayment;
    const dtiPercent = monthlyIncome > 0 ? (totalMonthly / monthlyIncome) * 100 : 0;
    const band: AffordabilityBand["band"] =
      dtiPercent > AFFORDABILITY_HARD_DTI_PERCENT ? "above-hard" : dtiPercent > AFFORDABILITY_SOFT_DTI_PERCENT ? "above-soft" : "within";
    return { multiple, loanAmount, estimatedMonthlyPayment, dtiPercent, band };
  });
}

function CardShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-panel p-5">
      <h2 className="text-sm font-semibold text-slate-100">{title}</h2>
      <p className="mt-1 text-xs text-slate-500">{subtitle}</p>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function WordCountTool() {
  const [text, setText] = useState("");
  const wordCount = useMemo(() => (text.trim().length === 0 ? 0 : text.trim().split(/\s+/).length), [text]);
  const over = wordCount > NOTICE_OF_CORRECTION_WORD_LIMIT;

  return (
    <CardShell
      title="Notice of Correction word-count builder"
      subtitle="A section 159(3) notice of correction is limited to 200 words by statute — draft it here first."
    >
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={6}
        placeholder="Draft your correction statement here…"
        className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-accent focus:outline-none"
      />
      <p className={`mt-2 text-sm font-medium ${over ? "text-critical" : "text-slate-300"}`}>
        {wordCount} / {NOTICE_OF_CORRECTION_WORD_LIMIT} words{over ? " — over the statutory limit" : ""}
      </p>
      <EstimateDisclaimer>
        This is a scratchpad only — it isn't wired into letter generation. Once you're happy with the wording, use this text in your
        Notice of Correction dispute letter from a report's dispute page (open a report, then "Export dispute text").
      </EstimateDisclaimer>
    </CardShell>
  );
}

interface CardRow {
  id: number;
  balance: string;
  limit: string;
}

function UtilisationSimulator() {
  const [rows, setRows] = useState<CardRow[]>([{ id: 1, balance: "", limit: "" }]);
  const [reduceBy, setReduceBy] = useState(0);
  let nextId = rows.length ? Math.max(...rows.map((r) => r.id)) + 1 : 1;

  const totals = rows.reduce(
    (acc, r) => {
      const balance = parseFloat(r.balance);
      const limit = parseFloat(r.limit);
      if (!isNaN(balance)) acc.balance += balance;
      if (!isNaN(limit)) acc.limit += limit;
      return acc;
    },
    { balance: 0, limit: 0 }
  );
  const utilisation = totals.limit > 0 ? (totals.balance / totals.limit) * 100 : null;
  const reducedBalance = Math.max(0, totals.balance - reduceBy);
  const reducedUtilisation = totals.limit > 0 ? (reducedBalance / totals.limit) * 100 : null;

  function updateRow(id: number, field: "balance" | "limit", value: string) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  }

  function removeRow(id: number) {
    setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.id !== id) : rs));
  }

  return (
    <CardShell title="Credit utilisation simulator" subtitle="Pure arithmetic on the numbers you enter — nothing is sent anywhere.">
      <div className="flex flex-col gap-2">
        {rows.map((r) => (
          <div key={r.id} className="flex items-center gap-2">
            <input
              type="number"
              inputMode="decimal"
              value={r.balance}
              onChange={(e) => updateRow(r.id, "balance", e.target.value)}
              placeholder="Balance £"
              className="w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-slate-100 focus:border-accent focus:outline-none"
            />
            <input
              type="number"
              inputMode="decimal"
              value={r.limit}
              onChange={(e) => updateRow(r.id, "limit", e.target.value)}
              placeholder="Limit £"
              className="w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-slate-100 focus:border-accent focus:outline-none"
            />
            <button
              onClick={() => removeRow(r.id)}
              disabled={rows.length === 1}
              className="shrink-0 rounded-md border border-border px-2 py-1.5 text-xs text-slate-400 hover:border-critical hover:text-critical disabled:opacity-40"
              title="Remove this card"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <button
        onClick={() => setRows((rs) => [...rs, { id: nextId, balance: "", limit: "" }])}
        className="mt-2 rounded-md border border-border px-3 py-1.5 text-xs text-slate-300 hover:border-accent hover:text-accent"
      >
        Add another card
      </button>

      <div className="mt-4 rounded-md border border-border bg-surface px-4 py-3">
        <p className="text-sm text-slate-200">
          Overall utilisation: <span className="font-semibold">{utilisation !== null ? `${utilisation.toFixed(1)}%` : "—"}</span>
        </p>
        <label htmlFor="reduce-by" className="mt-3 block text-xs uppercase tracking-wide text-slate-400">
          If you paid down balances by: £{reduceBy}
        </label>
        <input
          id="reduce-by"
          type="range"
          min={0}
          max={Math.max(100, Math.round(totals.balance))}
          step={10}
          value={reduceBy}
          onChange={(e) => setReduceBy(Number(e.target.value))}
          className="mt-1 w-full"
        />
        <p className="mt-1 text-sm text-slate-300">
          Resulting utilisation: <span className="font-semibold text-good">{reducedUtilisation !== null ? `${reducedUtilisation.toFixed(1)}%` : "—"}</span>
        </p>
      </div>
      <EstimateDisclaimer>
        Illustrative arithmetic only — not a real affordability or lending calculation, and it doesn't account for how any specific lender
        weighs utilisation.
      </EstimateDisclaimer>
    </CardShell>
  );
}

const MORTGAGE_CHECKS = [
  "No missed payments in the last 12 months",
  "Utilisation under 30% across all revolving credit",
  "No unsatisfied CCJs on file",
  "No active defaults on file",
  "On the electoral roll at your current address",
  "3+ years of address history on file",
  "Self-employed income has 2+ years of accounts (if applicable)",
  "No more than a handful of hard credit searches in the last 6 months",
];

function MortgageChecklist() {
  const [checked, setChecked] = useState<boolean[]>(() => MORTGAGE_CHECKS.map(() => false));
  const count = checked.filter(Boolean).length;

  return (
    <CardShell title="Mortgage-readiness checklist" subtitle="General educational guidance — not a lending decision or affordability assessment from any lender.">
      <ul className="flex flex-col gap-2">
        {MORTGAGE_CHECKS.map((label, i) => (
          <li key={i}>
            <label className="flex items-start gap-2 text-sm text-slate-200">
              <input
                type="checkbox"
                checked={checked[i]}
                onChange={(e) => setChecked((c) => c.map((v, idx) => (idx === i ? e.target.checked : v)))}
                className="mt-0.5"
              />
              {label}
            </label>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm font-medium text-slate-100">
        {count} of {MORTGAGE_CHECKS.length} common checks met
      </p>
      <EstimateDisclaimer>
        This is a general educational checklist, not a mortgage affordability assessment, credit decision, or advice from any lender —
        every real lender applies its own criteria.
      </EstimateDisclaimer>
    </CardShell>
  );
}

function SearchImpactCountdown() {
  const [searchDate, setSearchDate] = useState("");

  const daysLeft = useMemo(() => {
    if (!searchDate) return null;
    const start = new Date(searchDate);
    if (isNaN(start.getTime())) return null;
    const dropOff = new Date(start);
    dropOff.setFullYear(dropOff.getFullYear() + 1);
    const ms = dropOff.getTime() - Date.now();
    return Math.ceil(ms / (1000 * 60 * 60 * 24));
  }, [searchDate]);

  return (
    <CardShell title="Search-impact countdown" subtitle="UK credit searches standardly drop off a report 12 months after the search date.">
      <label htmlFor="search-date" className="block text-xs font-medium uppercase tracking-wide text-slate-400">
        Date of the credit search
      </label>
      <input
        id="search-date"
        type="date"
        value={searchDate}
        onChange={(e) => setSearchDate(e.target.value)}
        className="mt-1 w-full max-w-xs rounded-md border border-border bg-surface px-3 py-2 text-sm text-slate-100 focus:border-accent focus:outline-none"
      />
      {daysLeft !== null && (
        <p className="mt-3 text-sm text-slate-200">
          {daysLeft > 0 ? (
            <>
              <span className="font-semibold">{daysLeft}</span> day{daysLeft === 1 ? "" : "s"} remaining until this search is due to drop off.
            </>
          ) : (
            <span className="text-good">This search should already have dropped off (12 months have passed).</span>
          )}
        </p>
      )}
      <EstimateDisclaimer>
        A standard-case estimate based on the usual 12-month rule — always check the search's actual entry on your report, since timing
        can vary slightly by bureau.
      </EstimateDisclaimer>
    </CardShell>
  );
}

function CostOfWaitingEstimator() {
  const [balance, setBalance] = useState("");
  const [rate, setRate] = useState("");

  const monthlyCost = useMemo(() => {
    const b = parseFloat(balance);
    const r = parseFloat(rate);
    if (isNaN(b) || isNaN(r) || b <= 0 || r <= 0) return null;
    return (b * (r / 100)) / 12;
  }, [balance, rate]);

  return (
    <CardShell
      title="CCJ / default cost-of-waiting estimator"
      subtitle="An illustrative estimate of extra cost per month of non-payment — not a real statement from any creditor or court."
    >
      <label htmlFor="cow-balance" className="block text-xs font-medium uppercase tracking-wide text-slate-400">
        Outstanding balance (£)
      </label>
      <input
        id="cow-balance"
        type="number"
        inputMode="decimal"
        value={balance}
        onChange={(e) => setBalance(e.target.value)}
        className="mt-1 w-full max-w-xs rounded-md border border-border bg-surface px-3 py-2 text-sm text-slate-100 focus:border-accent focus:outline-none"
      />
      <label htmlFor="cow-rate" className="mt-3 block text-xs font-medium uppercase tracking-wide text-slate-400">
        Assumed annual interest rate (%)
      </label>
      <input
        id="cow-rate"
        type="number"
        inputMode="decimal"
        value={rate}
        onChange={(e) => setRate(e.target.value)}
        className="mt-1 w-full max-w-xs rounded-md border border-border bg-surface px-3 py-2 text-sm text-slate-100 focus:border-accent focus:outline-none"
      />
      <p className="mt-3 text-sm text-slate-200">
        Illustrative extra cost per month: <span className="font-semibold text-critical">{monthlyCost !== null ? `£${monthlyCost.toFixed(2)}` : "—"}</span>
      </p>
      <EstimateDisclaimer>
        A simple illustrative simple-interest calculation using the rate you enter — actual creditor interest, fees, and charges vary and
        may not accrue this way at all. This is not a real statement, invoice, or offer from any creditor.
      </EstimateDisclaimer>
    </CardShell>
  );
}

function DebtPayoffCalculator() {
  const [report, setReport] = useState<ReportDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aprs, setAprs] = useState<Record<string, string>>({});
  const [budget, setBudget] = useState("");

  useEffect(() => {
    api
      .listReports()
      .then(async (res) => {
        if (res.reports.length === 0) {
          setLoading(false);
          return;
        }
        const mostRecent = [...res.reports].sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())[0];
        const detail = await api.getReport(mostRecent.id);
        setReport(detail);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load your most recent report."))
      .finally(() => setLoading(false));
  }, []);

  const debtAccounts: DebtPayoffAccount[] = useMemo(() => {
    if (!report) return [];
    return report.accounts
      .filter((a) => a.status === "ACTIVE" && a.currentBalance !== null && parseFloat(a.currentBalance) > 0)
      .map((a) => ({
        id: a.id,
        lenderName: a.lenderName,
        balance: parseFloat(a.currentBalance as string),
        aprPercent: parseFloat(aprs[a.id] ?? "") || 0,
      }));
  }, [report, aprs]);

  const monthlyBudget = parseFloat(budget) || 0;
  const anyApr = debtAccounts.some((a) => a.aprPercent > 0);
  const snowball = useMemo(() => simulateDebtPayoff(debtAccounts, "snowball", monthlyBudget), [debtAccounts, monthlyBudget]);
  const avalanche = useMemo(() => simulateDebtPayoff(debtAccounts, "avalanche", monthlyBudget), [debtAccounts, monthlyBudget]);

  function renderResult(label: string, result: { months: number; totalInterest: number; order: string[] }) {
    const notCleared = result.months >= MAX_PAYOFF_MONTHS;
    return (
      <div className="rounded-md border border-border bg-surface px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
        {notCleared ? (
          <p className="mt-2 text-sm text-warn">Over 50 years — this budget isn't enough to clear these debts.</p>
        ) : (
          <>
            <p className="mt-2 text-sm text-slate-200">
              <span className="font-semibold">{result.months}</span> month{result.months === 1 ? "" : "s"} to clear all debts
            </p>
            {anyApr && (
              <p className="mt-1 text-sm text-slate-300">
                Total interest paid: <span className="font-semibold text-critical">£{result.totalInterest.toFixed(2)}</span>
              </p>
            )}
          </>
        )}
        {result.order.length > 0 && <p className="mt-2 text-xs text-slate-500">Payoff order: {result.order.join(" → ")}</p>}
      </div>
    );
  }

  return (
    <CardShell
      title="Debt payoff calculator (snowball vs. avalanche)"
      subtitle="Simulated month by month from your most recent report's active balances, plus the APRs and budget you enter."
    >
      {loading && <p className="text-sm text-slate-400">Loading…</p>}
      {error && <p className="text-sm text-critical">{error}</p>}
      {!loading && !error && debtAccounts.length === 0 && (
        <p className="text-sm text-slate-500">No active accounts with an outstanding balance found on your most recent report.</p>
      )}
      {!loading && !error && debtAccounts.length > 0 && (
        <div>
          <div className="flex flex-col gap-2">
            {debtAccounts.map((d) => (
              <div key={d.id} className="flex items-center gap-2">
                <span className="w-36 shrink-0 truncate text-sm text-slate-200" title={d.lenderName}>
                  {d.lenderName}
                </span>
                <span className="w-24 shrink-0 text-xs text-slate-400">£{Math.round(d.balance).toLocaleString("en-GB")}</span>
                <input
                  type="number"
                  inputMode="decimal"
                  value={aprs[d.id] ?? ""}
                  onChange={(e) => setAprs((prev) => ({ ...prev, [d.id]: e.target.value }))}
                  placeholder="APR % (optional)"
                  className="w-full max-w-[160px] rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-slate-100 focus:border-accent focus:outline-none"
                />
              </div>
            ))}
          </div>

          <label htmlFor="payoff-budget" className="mt-4 block text-xs font-medium uppercase tracking-wide text-slate-400">
            Total monthly budget for these debts (£)
          </label>
          <input
            id="payoff-budget"
            type="number"
            inputMode="decimal"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            placeholder="e.g. 200"
            className="mt-1 w-full max-w-xs rounded-md border border-border bg-surface px-3 py-2 text-sm text-slate-100 focus:border-accent focus:outline-none"
          />

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {renderResult("Snowball (smallest balance first)", snowball)}
            {renderResult("Avalanche (highest APR first)", avalanche)}
          </div>
        </div>
      )}
      <EstimateDisclaimer>
        Illustrative only — assumes you enter accurate APRs and stick to this budget every month; not financial advice. Credit reports
        don't include interest rates or minimum payments, so this simplifies to putting your whole budget toward one debt at a time rather
        than modelling real minimum payments on the others.
      </EstimateDisclaimer>
    </CardShell>
  );
}

function AffordabilityEstimator() {
  const [report, setReport] = useState<ReportDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [income, setIncome] = useState("");
  const [existingDebt, setExistingDebt] = useState("");
  const [debtPrefilled, setDebtPrefilled] = useState(false);
  const [rate, setRate] = useState("6");

  useEffect(() => {
    api
      .listReports()
      .then(async (res) => {
        if (res.reports.length === 0) {
          setLoading(false);
          return;
        }
        const mostRecent = [...res.reports].sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())[0];
        const detail = await api.getReport(mostRecent.id);
        setReport(detail);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load your most recent report."))
      .finally(() => setLoading(false));
  }, []);

  const activeBalanceTotal = useMemo(() => {
    if (!report) return 0;
    return report.accounts
      .filter((a) => a.status === "ACTIVE" && a.currentBalance !== null)
      .reduce((sum, a) => sum + parseFloat(a.currentBalance as string), 0);
  }, [report]);

  useEffect(() => {
    if (!debtPrefilled && report) {
      setExistingDebt(activeBalanceTotal > 0 ? String(Math.round(activeBalanceTotal)) : "0");
      setDebtPrefilled(true);
    }
  }, [report, activeBalanceTotal, debtPrefilled]);

  const incomeNum = parseFloat(income) || 0;
  const existingDebtNum = parseFloat(existingDebt) || 0;
  const rateNum = parseFloat(rate) || 0;

  const bands = useMemo(
    () => (incomeNum > 0 ? estimateAffordability(incomeNum, existingDebtNum, rateNum, 25) : []),
    [incomeNum, existingDebtNum, rateNum]
  );

  return (
    <CardShell
      title="Mortgage / loan affordability estimate"
      subtitle="A simple debt-to-income illustration — not a mortgage offer or any specific lender's affordability check."
    >
      {loading && <p className="text-sm text-slate-400">Loading…</p>}
      {error && <p className="text-sm text-critical">{error}</p>}
      {!loading && !error && (
        <div>
          <label htmlFor="afford-income" className="block text-xs font-medium uppercase tracking-wide text-slate-400">
            Gross annual income (£)
          </label>
          <input
            id="afford-income"
            type="number"
            inputMode="decimal"
            value={income}
            onChange={(e) => setIncome(e.target.value)}
            placeholder="e.g. 35000"
            className="mt-1 w-full max-w-xs rounded-md border border-border bg-surface px-3 py-2 text-sm text-slate-100 focus:border-accent focus:outline-none"
          />

          <label htmlFor="afford-debt" className="mt-3 block text-xs font-medium uppercase tracking-wide text-slate-400">
            Existing monthly debt payments (£)
          </label>
          <input
            id="afford-debt"
            type="number"
            inputMode="decimal"
            value={existingDebt}
            onChange={(e) => setExistingDebt(e.target.value)}
            className="mt-1 w-full max-w-xs rounded-md border border-border bg-surface px-3 py-2 text-sm text-slate-100 focus:border-accent focus:outline-none"
          />
          {report && (
            <p className="mt-1 text-xs text-slate-500">
              Prefilled from your most recent report's total active balances (£{Math.round(activeBalanceTotal).toLocaleString("en-GB")}) as
              a rough proxy — reports don't include monthly payment figures, so override this with your real monthly payments if you know
              them.
            </p>
          )}

          <label htmlFor="afford-rate" className="mt-3 block text-xs font-medium uppercase tracking-wide text-slate-400">
            Assumed annual interest rate (%), 25-year term
          </label>
          <input
            id="afford-rate"
            type="number"
            inputMode="decimal"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            className="mt-1 w-full max-w-xs rounded-md border border-border bg-surface px-3 py-2 text-sm text-slate-100 focus:border-accent focus:outline-none"
          />

          {bands.length > 0 && (
            <div className="mt-4 overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[480px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface text-left text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-4 py-2">Illustrative loan</th>
                    <th className="px-4 py-2 text-right">Est. monthly payment</th>
                    <th className="px-4 py-2 text-right">Est. DTI</th>
                    <th className="px-4 py-2 text-right">Band</th>
                  </tr>
                </thead>
                <tbody>
                  {bands.map((b) => (
                    <tr key={b.multiple} className="border-b border-border/60 last:border-0">
                      <td className="px-4 py-2 text-slate-200">
                        {b.multiple}× income (£{Math.round(b.loanAmount).toLocaleString("en-GB")})
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-200">£{b.estimatedMonthlyPayment.toFixed(0)}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-200">{b.dtiPercent.toFixed(1)}%</td>
                      <td
                        className={`px-4 py-2 text-right font-medium ${
                          b.band === "within" ? "text-good" : b.band === "above-soft" ? "text-warn" : "text-critical"
                        }`}
                      >
                        {b.band === "within"
                          ? "Within typical range"
                          : b.band === "above-soft"
                            ? `Above ${AFFORDABILITY_SOFT_DTI_PERCENT}% (soft ceiling)`
                            : `Above ${AFFORDABILITY_HARD_DTI_PERCENT}% (hard ceiling)`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {incomeNum <= 0 && <p className="mt-3 text-sm text-slate-500">Enter a gross annual income above to see illustrative loan bands.</p>}
        </div>
      )}
      <EstimateDisclaimer>
        This is NOT a mortgage offer, a decision in principle, or any specific lender's affordability criteria — it's a simplified
        debt-to-income calculation using {AFFORDABILITY_SOFT_DTI_PERCENT}–{AFFORDABILITY_HARD_DTI_PERCENT}% as commonly-cited (not
        guaranteed by any lender) soft/hard ceilings. Real affordability checks use your full income, expenditure, and credit history in
        ways this simple estimate can't replicate.
      </EstimateDisclaimer>
    </CardShell>
  );
}

function DisputeOutcomeChecklist() {
  const steps = [
    "Send your dispute letter to the bureau and/or lender (see a report's dispute page to generate one).",
    "Await the statutory 28-day response window (section 159 disputes) — or the advisory window shown for other templates.",
    "Check the response: was the entry corrected, removed, or defended?",
    "If the deadline passes with no adequate response, escalate to the ICO (bureau disputes) or the FOS (lender conduct disputes).",
    "Track everything in the Dispute Tracker on your report page until resolved.",
  ];

  return (
    <CardShell title="Dispute-outcome checklist" subtitle="Purely informational — the general lifecycle of a UK credit-report dispute.">
      <ol className="flex flex-col gap-2 text-sm text-slate-200">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-2">
            <span className="shrink-0 font-semibold text-accent">{i + 1}.</span>
            <span>{s}</span>
          </li>
        ))}
      </ol>
      <div className="mt-4 flex flex-wrap gap-3 text-xs">
        <Link to="/reconciliation" className="rounded-md border border-border px-3 py-1.5 text-slate-300 hover:border-accent hover:text-accent">
          Open tri-bureau reconciliation
        </Link>
        <Link to="/" className="rounded-md border border-border px-3 py-1.5 text-slate-300 hover:border-accent hover:text-accent">
          Open your reports
        </Link>
      </div>
      <EstimateDisclaimer>
        This is a general summary of the dispute lifecycle, not legal advice — actual deadlines and escalation routes depend on the
        specific template used (see the dispute tracker on each report for the real dates).
      </EstimateDisclaimer>
    </CardShell>
  );
}

function NextBestActionSummary() {
  const [report, setReport] = useState<ReportDetail | null>(null);
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listReports()
      .then(async (res) => {
        if (res.reports.length === 0) {
          setLoading(false);
          return;
        }
        const mostRecent = [...res.reports].sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())[0];
        setSummary(mostRecent);
        const detail = await api.getReport(mostRecent.id);
        setReport(detail);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load your most recent report."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <CardShell title="Next-best-action summary" subtitle="Suggested actions this app already computed for your most recent report.">
      {loading && <p className="text-sm text-slate-400">Loading…</p>}
      {error && <p className="text-sm text-critical">{error}</p>}
      {!loading && !error && !summary && (
        <p className="text-sm text-slate-500">No reports yet — upload one to see its suggested actions here.</p>
      )}
      {report && summary && (
        <div>
          <p className="text-xs text-slate-500">
            From {summary.bureau} report uploaded {new Date(summary.uploadedAt).toLocaleDateString("en-GB")}
            {" · "}
            <Link to={`/reports/${summary.id}`} className="text-accent hover:underline">
              Open report
            </Link>
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {report.insights.suggestedActions.map((action, i) => (
              <li key={i} className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-slate-200">
                {action}
              </li>
            ))}
          </ul>
        </div>
      )}
      <EstimateDisclaimer>
        These actions are computed server-side from your own uploaded report (see the report's own page) — this card only re-surfaces
        them, it doesn't add new analysis or advice.
      </EstimateDisclaimer>
    </CardShell>
  );
}

const TOOLS: { id: string; label: string; render: () => React.ReactNode }[] = [
  { id: "word-count", label: "Notice of Correction word count", render: () => <WordCountTool /> },
  { id: "utilisation", label: "Utilisation simulator", render: () => <UtilisationSimulator /> },
  { id: "mortgage", label: "Mortgage readiness", render: () => <MortgageChecklist /> },
  { id: "search-countdown", label: "Search-impact countdown", render: () => <SearchImpactCountdown /> },
  { id: "cost-of-waiting", label: "Cost-of-waiting estimator", render: () => <CostOfWaitingEstimator /> },
  { id: "debt-payoff", label: "Debt payoff calculator", render: () => <DebtPayoffCalculator /> },
  { id: "affordability", label: "Affordability estimate", render: () => <AffordabilityEstimator /> },
  { id: "dispute-outcome", label: "Dispute-outcome checklist", render: () => <DisputeOutcomeChecklist /> },
  { id: "next-best-action", label: "Next-best-action summary", render: () => <NextBestActionSummary /> },
];

export function EnhancementSuitePage() {
  const [active, setActive] = useState(TOOLS[0].id);
  const activeTool = TOOLS.find((t) => t.id === active) ?? TOOLS[0];

  return (
    <AppShell>
      <div>
        <h1 className="text-xl font-semibold text-slate-100">Enhancement suite</h1>
        <p className="mt-1 text-sm text-slate-400">
          Quick client-side calculators and checklists. Every tool here is illustrative or educational only — none of it is financial or
          legal advice, and none of it is a real decision from any lender, bureau, or regulator.
        </p>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            onClick={() => setActive(t.id)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium ${
              active === t.id ? "bg-accent text-white" : "border border-border text-slate-300 hover:border-accent hover:text-accent"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-6">{activeTool.render()}</div>
    </AppShell>
  );
}
