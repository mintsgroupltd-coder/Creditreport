import { Link } from "react-router-dom";

export type RemediationStep = 1 | 2 | 3 | 4 | 5;

const STEP_LABELS: Record<RemediationStep, string> = {
  1: "Ingest & Connect",
  2: "Forensic Quality Audit",
  3: "Multi-Bureau Reconciliation",
  4: "Statutory Legal Action",
  5: "Enhancement Suite",
};

const STEPS: RemediationStep[] = [1, 2, 3, 4, 5];

/**
 * Persistent, presentational horizontal stepper for the 5-stage guided
 * remediation flow. Purely visual + navigational — it holds no fetching
 * logic of its own, and the parent page decides what each step actually
 * links to via `stepRoutes`.
 */
export function RemediationStepper({
  currentStep,
  completedSteps,
  stepRoutes,
}: {
  currentStep: RemediationStep;
  completedSteps: number[];
  stepRoutes: Record<RemediationStep, string>;
}) {
  return (
    <nav aria-label="Remediation progress" className="rounded-lg border border-border bg-panel p-4">
      <ol className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-2">
        {STEPS.map((step, i) => {
          const isActive = step === currentStep;
          const isCompleted = completedSteps.includes(step) && !isActive;

          return (
            <li key={step} className="flex flex-1 items-center gap-2">
              <Link
                to={stepRoutes[step]}
                className={`flex flex-1 items-center gap-2 rounded-md border px-3 py-2 text-xs sm:text-sm ${
                  isActive
                    ? "border-accent bg-accent/10 text-accent"
                    : isCompleted
                      ? "border-good/40 bg-good/5 text-good hover:border-good"
                      : "border-border text-slate-400 hover:border-accent hover:text-accent"
                }`}
              >
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                    isActive
                      ? "bg-accent text-white"
                      : isCompleted
                        ? "bg-good text-white"
                        : "bg-border text-slate-400"
                  }`}
                >
                  {isCompleted ? "✓" : step}
                </span>
                <span className={`font-medium ${isActive ? "text-accent" : isCompleted ? "text-good" : "text-slate-300"}`}>
                  {STEP_LABELS[step]}
                </span>
              </Link>
              {i < STEPS.length - 1 && <span className="hidden text-slate-600 sm:block">→</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
