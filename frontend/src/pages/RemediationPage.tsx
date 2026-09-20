import { AlertTriangle, ArrowUpRight, CheckCircle2, FileSearch, GitCompareArrows, Send, TrendingUp, Upload } from "lucide-react";
import { ReactNode, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { DisputeRecordRow, ReconciliationResponse, ReportDetail, ReportSummary } from "../api/types";
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

function Card({ icon: Icon, title, children }: { icon: typeof Upload; title: string; children: ReactNode }) {
  return (
    <section className="mt-6 rounded-xl border border-border bg-panel p-6">
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <h2 className="text-sm font-semibold text-slate-100">{title}</h2>
      </div>
      <div className="mt-4 text-sm text-slate-300">{children}</div>
    </section>
  );
}

/** Small "N" / label stat tile used across steps 2–4's inline previews — a
 * single number the user can take in at a glance before deciding whether
 * to drill into the full page. */
function Stat({ value, label, tone = "neutral" }: { value: string | number; label: string; tone?: "neutral" | "warn" | "critical" | "good" }) {
  const toneClass = { neutral: "text-slate-100", warn: "text-warn", critical: "text-critical", good: "text-good" }[tone];
  return (
    <div className="rounded-lg border border-border bg-surface px-4 py-3">
      <div className={`text-xl font-semibold ${toneClass}`}>{value}</div>
      <div className="mt-0.5 text-xs text-slate-400">{label}</div>
    </div>
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

const RISK_TONE: Record<ReportDetail["insights"]["riskLevel"], "good" | "warn" | "critical"> = {
  LOW: "good",
  MEDIUM: "warn",
  HIGH: "critical",
  SEVERE: "critical",
};

export function RemediationPage() {
  const { step: stepParam } = useParams<{ step: string }>();
  const navigate = useNavigate();
  const step = parseStep(stepParam);

  const [reports, setReports] = useState<ReportSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Inline previews for steps 2–4 — fetched lazily, only for the step
  // currently on screen, so opening the guided flow doesn't fire off
  // every report/reconciliation/dispute request up front.
  const [reportDetail, setReportDetail] = useState<ReportDetail | null>(null);
  const [reconciliation, setReconciliation] = useState<ReconciliationResponse | null>(null);
  const [disputes, setDisputes] = useState<DisputeRecordRow[] | null>(null);

  useEffect(() => {
    api
      .listReports()
      .then((res) => setReports(res.reports))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load your reports."));
  }, []);

  // Reports are returned most-recently-uploaded first (see DashboardPage's
  // own use of listReports) — the newest one is what steps 2–5 work from.
  const mostRecent = reports && reports.length > 0 ? reports[0] : null;

  useEffect(() => {
    if (step === 2 && mostRecent) {
      api.getReport(mostRecent.id).then(setReportDetail).catch(() => setReportDetail(null));
    }
    if (step === 3) {
      api.getReconciliation().then(setReconciliation).catch(() => setReconciliation(null));
    }
    if ((step === 4 || step === 5) && mostRecent) {
      api
        .listDisputes(mostRecent.id)
        .then((res) => setDisputes(res.disputes))
        .catch(() => setDisputes(null));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, mostRecent?.id]);

  // A step is "completed" once its underlying real-world condition is
  // true — there's no separate progress record for this flow, so this
  // stepper just reflects state that already exists elsewhere in the app.
  const completedSteps: number[] = [];
  if (mostRecent) completedSteps.push(1);
  if (reconciliation && reconciliation.eligible) completedSteps.push(3);
  if (disputes && disputes.length > 0) completedSteps.push(4);

  const openDisputeCount = disputes?.filter((d) => d.status !== "RESOLVED").length ?? 0;
  const overdueCount =
    disputes?.filter((d) => d.status === "NO_RESPONSE" || (d.responseDeadline && new Date(d.responseDeadline) < new Date() && !d.resolvedAt))
      .length ?? 0;

  return (
    <AppShell>
      <div>
        <h1 className="text-xl font-semibold text-slate-100">Guided flow</h1>
        <p className="mt-1 text-sm text-slate-400">
          The fastest path through this app, five steps: upload a report, see what's wrong with it, check it against your other bureaus,
          dispute what's incorrect, then track it through to resolution. Every step also works as its own standalone page — nothing here
          is locked behind finishing the last one.
        </p>
      </div>

      <div className="mt-4">
        <RemediationStepper currentStep={step} completedSteps={completedSteps} stepRoutes={STEP_ROUTES} />
      </div>

      {error && <p className="mt-4 text-sm text-critical">{error}</p>}

      {step === 1 && (
        <Card icon={Upload} title="1 · Upload your report">
          <p>
            Start by uploading a credit report export (PDF or CSV) from Experian, Equifax or TransUnion. Once it's parsed, the rest of
            this flow works from that report.
          </p>
          <div className="mt-4">
            <ReportUploadForm onUploaded={() => navigate("/remediate/2")} onError={setError} label="Upload a report" />
          </div>

          <h3 className="mt-6 text-xs font-semibold uppercase tracking-wide text-slate-400">Or try a sample report</h3>
          <p className="mt-1 text-xs text-slate-500">
            Three seeded demo files are already on your dashboard, badged "Sample data" — fictional fixtures, not real credit reports,
            useful for seeing how each stage behaves.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {SAMPLE_PERSONAS.map((p) => (
              <Link key={p.name} to="/" className="rounded-lg border border-border bg-surface px-4 py-3 text-left hover:border-accent">
                <div className="text-sm font-medium text-slate-100">{p.name}</div>
                <p className="mt-1 text-xs text-slate-400">{p.description}</p>
              </Link>
            ))}
          </div>

          <TransitionBanner to="/remediate/2" label="Report uploaded? Move on to the forensic quality audit" />
        </Card>
      )}

      {step === 2 && (
        <Card icon={FileSearch} title="2 · Forensic quality audit">
          <p>
            Every uploaded report is automatically run through this app's data-quality checks — mixed-file risk, name/DOB mismatches,
            duplicate accounts, high utilisation, unsatisfied CCJs, active defaults and search volume.
          </p>
          {!mostRecent ? (
            <p className="mt-4 text-slate-400">
              No report uploaded yet —{" "}
              <Link to="/remediate/1" className="text-accent hover:underline">
                go back to step 1
              </Link>{" "}
              first.
            </p>
          ) : reportDetail ? (
            <div className="mt-4">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${
                    RISK_TONE[reportDetail.insights.riskLevel] === "good"
                      ? "bg-good/15 text-good"
                      : RISK_TONE[reportDetail.insights.riskLevel] === "warn"
                        ? "bg-warn/15 text-warn"
                        : "bg-critical/15 text-critical"
                  }`}
                >
                  {reportDetail.insights.riskLevel} risk
                </span>
                <span className="text-xs text-slate-500">{mostRecent.sourceFileName}</span>
              </div>
              <p className="mt-3">{reportDetail.insights.summary}</p>
              <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                <Stat
                  value={reportDetail.negativeMarkers.activeDefaultCount}
                  label="Active defaults"
                  tone={reportDetail.negativeMarkers.activeDefaultCount > 0 ? "critical" : "good"}
                />
                <Stat
                  value={reportDetail.negativeMarkers.unsatisfiedCcjCount}
                  label="Unsatisfied CCJs"
                  tone={reportDetail.negativeMarkers.unsatisfiedCcjCount > 0 ? "critical" : "good"}
                />
                <Stat
                  value={reportDetail.negativeMarkers.highUtilisationCount}
                  label="High utilisation"
                  tone={reportDetail.negativeMarkers.highUtilisationCount > 0 ? "warn" : "good"}
                />
                <Stat value={reportDetail.negativeMarkers.recentSearchCount} label="Recent searches" />
              </div>
              {reportDetail.insights.suggestedActions.length > 0 && (
                <ul className="mt-4 flex flex-col gap-1.5">
                  {reportDetail.insights.suggestedActions.slice(0, 3).map((action) => (
                    <li key={action} className="flex items-start gap-2 text-sm text-slate-300">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" aria-hidden="true" />
                      {action}
                    </li>
                  ))}
                </ul>
              )}
              <Link
                to={`/reports/${mostRecent.id}`}
                className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline"
              >
                Open the full report <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate-500">Loading your latest report…</p>
          )}
          <TransitionBanner to="/remediate/3" label="Ready to see how this compares across bureaus?" />
        </Card>
      )}

      {step === 3 && (
        <Card icon={GitCompareArrows} title="3 · Multi-bureau reconciliation">
          <p>
            Once you've uploaded a report from more than one bureau, this app cross-checks the same lender/account across all of them and
            flags anything reported inconsistently — a status, balance or default date that doesn't agree between Experian, Equifax and
            TransUnion.
          </p>
          {reconciliation ? (
            reconciliation.eligible ? (
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Stat
                  value={reconciliation.discrepancyCount}
                  label="Discrepancies found"
                  tone={reconciliation.discrepancyCount > 0 ? "warn" : "good"}
                />
                <p className="text-sm text-slate-400">
                  Across {reconciliation.bureausIncluded.length} bureaus: {reconciliation.bureausIncluded.map((b) => b.bureau).join(", ")}.
                </p>
              </div>
            ) : (
              <p className="mt-4 rounded-lg border border-border bg-surface px-4 py-3 text-sm text-slate-400">{reconciliation.message}</p>
            )
          ) : (
            <p className="mt-4 text-sm text-slate-500">Checking your uploaded reports…</p>
          )}
          <TransitionBanner to="/reconciliation" label="Open full tri-bureau reconciliation" />
        </Card>
      )}

      {step === 4 && (
        <Card icon={Send} title="4 · Statutory dispute action">
          <p>
            Dispute letters — including the section 159 statutory templates, CCJ challenges and default validation requests — are
            generated from a report's own page: choose a template, export the letter text or a print-ready PDF, then log it as sent to
            track its statutory response deadline and any escalation to the ICO or FOS.
          </p>
          {!mostRecent ? (
            <p className="mt-4 text-slate-400">
              No report uploaded yet —{" "}
              <Link to="/remediate/1" className="text-accent hover:underline">
                go back to step 1
              </Link>{" "}
              first.
            </p>
          ) : (
            <div className="mt-4">
              {disputes && disputes.length > 0 ? (
                <div className="flex flex-wrap gap-2.5">
                  <Stat value={disputes.length} label="Disputes logged" />
                  <Stat value={openDisputeCount} label="Still open" tone={openDisputeCount > 0 ? "warn" : "good"} />
                </div>
              ) : (
                <p className="text-sm text-slate-400">No disputes logged yet for "{mostRecent.sourceFileName}".</p>
              )}
              <Link
                to={`/reports/${mostRecent.id}`}
                className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline"
              >
                Go to dispute generation <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </div>
          )}
          <p className="mt-4 text-xs text-slate-500">
            See "Useful contacts" on the report page, or the full{" "}
            <Link to="/registry" className="text-accent hover:underline">
              statutory registry
            </Link>
            , for who each letter actually goes to.
          </p>
          <TransitionBanner to="/remediate/5" label="Disputes logged? Track them through to resolution" />
        </Card>
      )}

      {step === 5 && (
        <Card icon={TrendingUp} title="5 · Track & grow">
          <p>
            Once a letter's out the door, the last step is following it through — and, separately, building the file up rather than just
            correcting it.
          </p>
          {mostRecent && disputes && disputes.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2.5">
              <Stat value={openDisputeCount} label="Open disputes" tone={openDisputeCount > 0 ? "warn" : "good"} />
              <Stat value={overdueCount} label="Past their deadline" tone={overdueCount > 0 ? "critical" : "good"} />
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate-400">No disputes logged yet — nothing to track until step 4 is done.</p>
          )}
          {mostRecent && (
            <Link
              to={`/reports/${mostRecent.id}`}
              className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline"
            >
              Open the dispute tracker <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          )}
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-border bg-surface px-4 py-3 text-sm text-slate-300">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
            <span>
              The Enhancement Suite has a debt payoff planner (snowball/avalanche) and a mortgage affordability estimate — both
              educational, not advice — for once the corrections are in motion.
            </span>
          </div>
          <TransitionBanner to="/enhancement-suite" label="Open the enhancement suite" />
        </Card>
      )}
    </AppShell>
  );
}
