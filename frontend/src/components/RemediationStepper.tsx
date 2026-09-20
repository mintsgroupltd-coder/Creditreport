import { Check } from "lucide-react";
import { Link } from "react-router-dom";

export type RemediationStep = 1 | 2 | 3 | 4 | 5;

const STEP_LABELS: Record<RemediationStep, string> = {
  1: "Upload",
  2: "Audit",
  3: "Reconcile",
  4: "Dispute",
  5: "Track & grow",
};

const STEPS: RemediationStep[] = [1, 2, 3, 4, 5];

/**
 * Persistent, presentational horizontal stepper for the 5-stage guided
 * flow. Purely visual + navigational — it holds no fetching logic of its
 * own, and the parent page decides what each step actually links to via
 * `stepRoutes`. Every step stays clickable (not just completed ones) —
 * this is a guided tour of tools that already work standalone, not a
 * form wizard that has to be completed in order.
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
    <nav aria-label="Guided flow progress" className="rounded-xl border border-border bg-panel p-4">
      <ol className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-0">
        {STEPS.map((step, i) => {
          const isActive = step === currentStep;
          const isCompleted = completedSteps.includes(step) && !isActive;

          return (
            <li key={step} className="flex flex-1 items-center">
              <Link
                to={stepRoutes[step]}
                aria-current={isActive ? "step" : undefined}
                className={`flex flex-1 items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm ${
                  isActive
                    ? "border-accent bg-accent/10 text-accent"
                    : isCompleted
                      ? "border-good/40 bg-good/5 text-good hover:border-good"
                      : "border-transparent text-slate-400 hover:border-border hover:text-slate-200"
                }`}
              >
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                    isActive ? "bg-accent text-white" : isCompleted ? "bg-good text-white" : "bg-border text-slate-400"
                  }`}
                >
                  {isCompleted ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : step}
                </span>
                <span className={`font-medium ${isActive ? "text-accent" : isCompleted ? "text-good" : "text-slate-300"}`}>
                  {STEP_LABELS[step]}
                </span>
              </Link>
              {i < STEPS.length - 1 && <span className="hidden h-px w-4 shrink-0 bg-border sm:block" aria-hidden="true" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
