import { ReactNode, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { ReportSummary } from "../api/types";
import { AppShell } from "../components/AppShell";
import { RemediationStep, RemediationStepper } from "../components/RemediationStepper";
import { ReportUploadForm } from "../components/ReportUploadForm";
import { TransitionBanner } from "../components/TransitionBanner";

const STEP_ROUTES: Record<RemediationStep, string> = {
  1: "/remediate/1",
  2: "/remediate/2",
  3: "/remediate/3",
  4: "/remediate/4",
  5: "/remediate/5",
};

function parseStep(raw: string | undefined): RemediationStep {
  const n = Number(raw);
  if (n === 1 || n === 2 || n === 3 || n === 4 || n === 5) return n;
  return 1;
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-6 rounded-lg border border-border bg-panel p-5">
      <h2 className="text-sm font-semibold text-slate-100">{title}</h2>
      <div className="mt-2 text-sm text-slate-300">{children}</div>
    </section>
  );
}

const SAMPLE_PERSONAS = [
  {
    name: "Mixed-file case study",
    description: "A file showing signs of another person's data blended in — name variations, a DOB mismatch, unfamiliar accounts.",
  },
  {
    name: "Clean prime profile",
    description: "A straightforward, well-conducted file with no defaults, low utilisation and no discrepancies to chase.",
  },
  {
    name: "Adverse defaults profile",
    description: "A file carrying active defaults and an unsatisfied CCJ, useful for exercising the dispute and escalation flows.",
  },
];

export function RemediationPage() {
  const { step: stepParam } = useParams<{ step: string }>();
  const navigate = useNavigate();
  const step = parseStep(stepParam);

  const [reports, setReports] = useState<ReportSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listReports()
      .then((res) => setReports(res.reports))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load your reports."));
  }, []);

  // Reports are returned most-recently-uploaded first (see DashboardPage's
  // own use of listReports) — the newest one is what steps 2–4 send you to.
  const mostRecent = reports && reports.length > 0 ? reports[0] : null;

  // A step is "completed" once its underlying real-world condition is
  // true — there's no separate progress record for this flow, so this
  // stepper just reflects state that already exists elsewhere in the app
  // (whether a report exists yet).
  const completedSteps: number[] = mostRecent ? [1] : [];

  return (
    <AppShell>
      <div>
        <h1 className="text-xl font-semibold text-slate-100">Guided remediation</h1>
        <p className="mt-1 text-sm text-slate-400">
          A step-by-step path through the tools already in this app — from uploading a report through to statutory action and beyond.
        </p>
      </div>

      <div className="mt-4">
        <RemediationStepper currentStep={step} completedSteps={completedSteps} stepRoutes={STEP_ROUTES} />
      </div>

      {error && <p className="mt-4 text-sm text-critical">{error}</p>}

      {step === 1 && (
        <Card title="1. Ingest & Connect">
          <p>
            Start by uploading a credit report export (PDF or CSV) from Experian, Equifax or TransUnion. Once it's parsed, the rest of
            this flow works from that report.
          </p>
          <div className="mt-4">
            <ReportUploadForm onUploaded={(reportId) => navigate(`/reports/${reportId}`)} onError={setError} label="Upload a report" />
          </div>

          <h3 className="mt-6 text-xs font-semibold uppercase tracking-wide text-slate-400">Or try a sample report</h3>
          <p className="mt-1 text-xs text-slate-500">
            Three seeded demo files are already available on your dashboard, badged "Sample data" — fictional fixtures, not real credit
            reports, useful for seeing how each stage behaves.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {SAMPLE_PERSONAS.map((p) => (
              <Link
                key={p.name}
                to="/"
                className="rounded-lg border border-border bg-surface px-4 py-3 text-left hover:border-accent"
              >
                <div className="text-sm font-medium text-slate-100">{p.name}</div>
                <p className="mt-1 text-xs text-slate-400">{p.description}</p>
              </Link>
            ))}
          </div>

          <TransitionBanner to="/remediate/2" label="Report uploaded? Move on to the forensic quality audit →" />
        </Card>
      )}

      {step === 2 && (
        <Card title="2. Forensic Quality Audit">
          <p>
            Every uploaded report is already run through this app's data-quality checks — mixed-file risk, name/DOB mismatches, duplicate
            accounts, high utilisation, unsatisfied CCJs, active defaults and search volume — and the results are surfaced as alerts on
            the report's own page, with a document inspector that pins each alert back to where it appears in the source text.
          </p>
          {mostRecent ? (
            <p className="mt-3">
              <Link to={`/reports/${mostRecent.id}`} className="font-medium text-accent hover:underline">
                Open the audit for "{mostRecent.sourceFileName}" →
              </Link>
            </p>
          ) : (
            <p className="mt-3 text-slate-400">
              No report uploaded yet —{" "}
              <Link to="/remediate/1" className="text-accent hover:underline">
                go back to step 1
              </Link>{" "}
              first.
            </p>
          )}
          <TransitionBanner to="/reconciliation" label="Ready to see how these compare across bureaus? →" />
        </Card>
      )}

      {step === 3 && (
        <Card title="3. Multi-Bureau Reconciliation">
          <p>
            Once you've uploaded a report from more than one bureau, this app cross-checks the same lender/account across all of them and
            flags anything reported inconsistently — a status, balance or default date that doesn't agree between Experian, Equifax and
            TransUnion.
          </p>
          <TransitionBanner to="/reconciliation" label="Open tri-bureau reconciliation →" />
        </Card>
      )}

      {step === 4 && (
        <Card title="4. Statutory Legal Action">
          <p>
            Dispute letters — including the section 159 statutory templates, CCJ challenges and default validation requests — are
            generated from a report's own page: choose a template, export the letter text or a print-ready PDF, then log it as sent to
            track its statutory response deadline and any escalation to the ICO or FOS.
          </p>
          {mostRecent ? (
            <p className="mt-3">
              <Link to={`/reports/${mostRecent.id}`} className="font-medium text-accent hover:underline">
                Go to dispute generation for "{mostRecent.sourceFileName}" →
              </Link>
            </p>
          ) : (
            <p className="mt-3 text-slate-400">
              No report uploaded yet —{" "}
              <Link to="/remediate/1" className="text-accent hover:underline">
                go back to step 1
              </Link>{" "}
              first.
            </p>
          )}
          <p className="mt-3 text-xs text-slate-500">
            See "Useful contacts" on the report page, or the full{" "}
            <Link to="/registry" className="text-accent hover:underline">
              statutory registry
            </Link>
            , for who each letter actually goes to.
          </p>
          <TransitionBanner to="/remediate/5" label="Disputes logged? See the enhancement suite →" />
        </Card>
      )}

      {step === 5 && (
        <Card title="5. Enhancement Suite">
          <p>
            Longer-term, proactive tools for building your file up rather than just correcting it — this stage is being built out
            separately.
          </p>
          <TransitionBanner to="/enhancement-suite" label="Open the enhancement suite →" />
        </Card>
      )}
    </AppShell>
  );
}
