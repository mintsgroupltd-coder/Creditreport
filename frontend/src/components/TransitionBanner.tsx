import { Link } from "react-router-dom";

/**
 * A small, reusable "what to do next" prompt used at the bottom of a
 * RemediationPage step — a styled Link, nothing more. Visually distinct
 * (accent border + tinted background) from the neutral cards around it
 * so it reads as a call to action rather than more explanatory text.
 */
export function TransitionBanner({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-accent/40 bg-accent/10 px-4 py-3 text-sm font-medium text-accent hover:border-accent hover:bg-accent/15"
    >
      <span>{label}</span>
      <span aria-hidden="true">→</span>
    </Link>
  );
}
