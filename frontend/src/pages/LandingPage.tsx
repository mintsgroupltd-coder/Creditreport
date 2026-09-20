import { Link } from "react-router-dom";

const FEATURES: { title: string; body: string }[] = [
  {
    title: "A guided, step-by-step flow",
    body: "Upload → audit → reconcile across bureaus → dispute → track — five steps through the tools below, in order, with a live preview of your own results at each one. Every step also works as its own standalone page if you'd rather jump around.",
  },
  {
    title: "Upload a real UK credit report",
    body: "PDF or CSV, from Experian, Equifax or TransUnion. Every account is parsed into a structured breakdown — balances, limits, defaults, arrears, searches, court records — not just a wall of extracted text.",
  },
  {
    title: "Forensic audit, not just a summary",
    body: "An automatic scan for negative markers and identity-anomaly signals, including mixed-file/cross-contamination flags where a DOB or name doesn't match across accounts — the kind of thing worth catching before it costs you a mortgage application.",
  },
  {
    title: "Tri-bureau reconciliation",
    body: "Upload reports from more than one bureau and see where they disagree — balances, statuses, dates — cell by cell, with a one-click link straight into a dispute letter for any discrepancy.",
  },
  {
    title: "Ready-to-send statutory dispute letters",
    body: "Template-driven dispute letters (Section 159 Consumer Credit Act, Data Protection Act/UK GDPR, Consumer Credit Act default notices) as PDFs — with an explicit, reviewed send-by-email step, deadline tracking, and a one-click escalation pack for the ICO or Financial Ombudsman when a bureau misses its deadline.",
  },
  {
    title: "Time-limited, revocable share links",
    body: "Share a read-only, stripped-down view of a report with a broker or adviser via a link that expires on its own and can be revoked at any time — no account required on their end.",
  },
  {
    title: "Two-factor authentication and session control",
    body: "TOTP-based 2FA with backup codes, a list of every device signed in to your account with individual or bulk revoke, and an activity log of report views, downloads and shares.",
  },
];

const HONESTY_NOTES: string[] = [
  "The credit score shown for each report is this app's own illustrative estimate on that bureau's scale — never a real bureau score, and never claimed to be one.",
  "Nothing here connects to a real credit reference agency. The \"Equifax gateway\" is a clearly-labelled simulation for illustrating what an API integration might look like.",
  "Your name, date of birth and address are self-declared by you, used to fill in letters and cross-check against report data — never verified against an official register.",
  "Every calculator in the Enhancement Suite (debt payoff, mortgage affordability, utilisation, and the rest) is explicitly educational, never financial or legal advice.",
];

export function LandingPage() {
  return (
    <div className="min-h-screen bg-surface text-slate-100">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <span className="text-sm font-semibold tracking-wide text-slate-100">Credit Report Analyzer</span>
          <div className="flex items-center gap-3 text-sm">
            <Link to="/login" className="rounded-md border border-border px-3 py-1.5 text-slate-300 hover:border-accent hover:text-accent">
              Log in
            </Link>
            <Link to="/signup" className="rounded-md bg-accent px-3 py-1.5 font-medium text-white hover:bg-accent/90">
              Sign up
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-4xl px-6 pb-16 pt-20 text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-100 sm:text-4xl">
            Understand your UK credit report — and do something about it
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base text-slate-400">
            Upload an Experian, Equifax or TransUnion report and get a forensic-quality breakdown, a plain-English risk
            summary, tri-bureau reconciliation, and statutory dispute letters ready to send — all in one place, and all
            explained honestly rather than oversold.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Link
              to="/signup"
              className="rounded-md bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent/90"
            >
              Create a free account
            </Link>
            <Link
              to="/login"
              className="rounded-md border border-border px-5 py-2.5 text-sm font-medium text-slate-300 hover:border-accent hover:text-accent"
            >
              Log in
            </Link>
          </div>
        </section>

        <section className="border-t border-border bg-panel/40">
          <div className="mx-auto max-w-5xl px-6 py-14">
            <h2 className="text-center text-lg font-semibold text-slate-100">What it does</h2>
            <div className="mt-8 grid gap-5 sm:grid-cols-2">
              {FEATURES.map((f) => (
                <div key={f.title} className="rounded-lg border border-border bg-panel p-5">
                  <h3 className="text-sm font-semibold text-slate-100">{f.title}</h3>
                  <p className="mt-2 text-sm text-slate-400">{f.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-border">
          <div className="mx-auto max-w-3xl px-6 py-14">
            <h2 className="text-center text-lg font-semibold text-slate-100">What it's honest about</h2>
            <p className="mx-auto mt-2 max-w-2xl text-center text-sm text-slate-400">
              A tool that touches your credit file should be upfront about its own limits. A few things worth knowing
              before you upload anything:
            </p>
            <ul className="mt-6 flex flex-col gap-3">
              {HONESTY_NOTES.map((note) => (
                <li key={note} className="rounded-md border border-border bg-surface px-4 py-3 text-sm text-slate-400">
                  {note}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="border-t border-border bg-panel/40">
          <div className="mx-auto max-w-3xl px-6 py-14 text-center">
            <h2 className="text-lg font-semibold text-slate-100">Ready to see what's actually in your report?</h2>
            <p className="mt-2 text-sm text-slate-400">
              Sign up, upload a report — or open one of the built-in sample reports first if you'd rather look before
              uploading anything of your own.
            </p>
            <div className="mt-6 flex items-center justify-center gap-3">
              <Link
                to="/signup"
                className="rounded-md bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent/90"
              >
                Get started
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-5xl px-6 py-6 text-center text-xs text-slate-500">
          Not affiliated with Experian, Equifax or TransUnion. Nothing on this site is financial or legal advice.
        </div>
      </footer>
    </div>
  );
}
