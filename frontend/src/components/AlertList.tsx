import { useState } from "react";
import { Link } from "react-router-dom";
import { AccountRow, AlertRow, AlertType } from "../api/types";

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

/** Plain-English "what this means / what to do" guidance per alert type,
 * shown when an alert row is expanded. Kept here (rather than fetched from
 * the API) since it's static copy, not data — one line explaining the
 * finding plus one concrete next step. */
const TYPE_GUIDANCE: Record<AlertType, { whatItMeans: string; whatToDo: string }> = {
  DOB_MISMATCH: {
    whatItMeans: "This account is recorded against a different date of birth than the rest of your file — a common sign of a data-entry error or a merged/linked record with someone else.",
    whatToDo: "Raise it directly with the bureau's data-quality team and with the lender shown on the account. Use the \"Export dispute text\" button on the report to generate a rectification request.",
  },
  NAME_VARIATION: {
    whatItMeans: "This account uses a noticeably different spelling or form of your name than your other records.",
    whatToDo: "Usually harmless on its own, but worth confirming with the lender that it's genuinely yours and correctly linked, especially if it appears alongside other identity alerts.",
  },
  MIXED_FILE_RISK: {
    whatItMeans: "Multiple identity signals (name, date of birth, or address) disagree across accounts in a way that suggests your file may be mixed with someone else's.",
    whatToDo: "This is worth escalating to the bureau as a potential mixed file, since it can affect several accounts at once rather than just one.",
  },
  DUPLICATE_ACCOUNT: {
    whatItMeans: "Two accounts look like they may be the same debt reported twice — often after a debt is sold on to a collections agency.",
    whatToDo: "Contact both creditors to confirm which one currently owns the debt, and ask the other to remove their entry if it's a duplicate.",
  },
  HIGH_UTILISATION: {
    whatItMeans: "This account's balance is a high percentage of its credit limit, which weighs on your score independently of whether payments are up to date.",
    whatToDo: "Paying this down below roughly 30% of the limit is usually the fastest score improvement available, since it doesn't depend on any third party.",
  },
  UNSATISFIED_CCJ: {
    whatItMeans: "A County Court Judgment against you hasn't been marked as paid — this is usually the single most damaging item on a UK credit file.",
    whatToDo: "If it's actually been paid, get a Certificate of Satisfaction from the court and send it to the bureau. If not, paying in full within one month of the judgment is the only way to have it removed outright rather than just marked satisfied.",
  },
  ACTIVE_DEFAULT: {
    whatItMeans: "This account is currently showing as in default, meaning the lender has formally recorded that payments broke down.",
    whatToDo: "Request a debt validation letter before paying anything, then negotiate a full-and-final settlement in writing — get any agreement confirmed in writing before you pay.",
  },
  SEARCH_VOLUME: {
    whatItMeans: "A high number of searches/enquiries were recorded in the last 12 months, which can read as active credit-seeking to a manual underwriter.",
    whatToDo: "Pause new credit and loan-comparison applications for a few months while other flagged items are resolved, so the file reads calmer.",
  },
};

export function AlertList({ alerts, accounts = [] }: { alerts: AlertRow[]; accounts?: AccountRow[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (alerts.length === 0) {
    return <p className="text-sm text-slate-400">No alerts were raised for this report.</p>;
  }

  const accountById = new Map(accounts.map((a) => [a.id, a]));

  return (
    <ul className="flex flex-col gap-2">
      {alerts.map((alert) => {
        const isOpen = expandedId === alert.id;
        const guidance = TYPE_GUIDANCE[alert.type];
        return (
          <li key={alert.id} className="rounded-lg border border-border bg-panel">
            <button
              type="button"
              onClick={() => setExpandedId(isOpen ? null : alert.id)}
              aria-expanded={isOpen}
              className="flex w-full items-start gap-3 px-4 py-3 text-left"
            >
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${SEVERITY_DOT[alert.severity] ?? "bg-slate-400"}`} />
              <div className="flex-1">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400 hover:text-accent">
                  {TYPE_LABEL[alert.type] ?? alert.type}
                  <span className="text-slate-600">{isOpen ? "▲" : "▼"}</span>
                </div>
                <p className="mt-0.5 text-sm text-slate-200">{alert.message}</p>
              </div>
            </button>
            {isOpen && (
              <div className="border-t border-border/60 px-4 py-3 pl-9 text-sm text-slate-300">
                {guidance ? (
                  <>
                    <p>
                      <span className="font-semibold text-slate-100">What this means: </span>
                      {guidance.whatItMeans}
                    </p>
                    <p className="mt-2">
                      <span className="font-semibold text-slate-100">What to do: </span>
                      {guidance.whatToDo}
                    </p>
                  </>
                ) : (
                  <p>No further guidance is available for this alert type yet.</p>
                )}
                {alert.relatedAccountIds.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-3">
                    {alert.relatedAccountIds.map((id) => {
                      const account = accountById.get(id);
                      return (
                        <Link key={id} to={`/accounts/${id}`} className="text-xs font-medium text-accent hover:underline">
                          View {account?.lenderName ?? "flagged account"} →
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
