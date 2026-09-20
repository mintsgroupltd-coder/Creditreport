/**
 * An ILLUSTRATIVE, this-app's-own credit score estimate — NOT a real
 * Experian/Equifax/TransUnion score.
 *
 * The three UK bureaus each run a proprietary scoring algorithm this app
 * has no access to, and each publishes only the outer shape of its own
 * scale (Experian 0–999, Equifax 0–1000, TransUnion/Callcredit 0–710).
 * The real number also depends on data this app was never given — full
 * payment-history depth month by month, account age/mix weighting,
 * application patterns over years, and whatever else each bureau folds
 * into its model — so this function cannot and does not reproduce it.
 *
 * What it does instead: take the same negative-marker counts the rest of
 * this app's analytics already compute (see negativeMarkers.ts) and turn
 * them into a simple, fully transparent point-deduction score on each
 * bureau's own 0–max scale, purely so a user can see roughly which
 * direction their position is likely to move in and by roughly how much,
 * relative to a clean report on the same scale. Every deduction is a
 * fixed, labelled amount — there's no hidden weighting, machine-learned
 * model, or attempt to match a real bureau's actual output. Treat the
 * `score` this returns as a comparison tool for this app's own findings,
 * never as a prediction of what a real bureau will show.
 */

export type CreditScoreBureau = "EXPERIAN" | "EQUIFAX" | "TRANSUNION";

export interface CreditScoreEstimateInput {
  /** Total number of accounts on the report (all statuses). Used only to
   * express the default count as a rate, for one extra deduction below. */
  totalAccounts: number;
  /** Count of accounts currently in default with no corroborated satisfaction
   * (see negativeMarkers.ts's findActiveDefaults). */
  activeDefaultCount: number;
  /** Count of CCJ/judgment events not marked satisfied (findUnsatisfiedCcjs). */
  unsatisfiedCcjCount: number;
  /** Count of accounts at or above the 50% utilisation threshold this app
   * already flags elsewhere (negativeMarkers.ts's HIGH_UTILISATION_THRESHOLD). */
  highUtilisationAccountCount: number;
  /** Count of searches/enquiries in roughly the last 12 months (negativeMarkers.ts's
   * recentSearches). */
  recentSearchCount: number;
}

export interface CreditScoreEstimate {
  bureau: CreditScoreBureau;
  score: number;
  maxScore: number;
  /** A plain-English band derived from this estimate's own percentage-of-max
   * thresholds below — not a claim about where a real bureau would place it. */
  band: string;
  /** Every deduction (and the starting point) that adds up to `score`, most
   * significant first is NOT guaranteed — this is simply the order each
   * factor is evaluated in. `impact` is in the same points as `score`
   * (negative for a deduction). */
  factors: { label: string; impact: number }[];
}

const BUREAU_MAX_SCORE: Record<CreditScoreBureau, number> = {
  EXPERIAN: 999,
  EQUIFAX: 1000,
  TRANSUNION: 710,
};

/**
 * A clean report (no defaults, no CCJs, no high utilisation, low search
 * volume) starts at 96% of the bureau's own maximum rather than 100% —
 * this app has no visibility into the payment-history depth, account age,
 * and years-of-good-conduct factors that a real score also rewards, so
 * claiming the literal top of the scale for a report with none of the
 * negative factors this app can see would overstate what "clean, as far
 * as this app can tell" actually means.
 */
const STARTING_RATIO = 0.96;

// Every deduction below is expressed as points out of a common 1000-point
// scale, then rescaled to each bureau's own maximum (see `scale` below) so
// the same negative factor has a proportionate effect regardless of which
// bureau's scale it's being shown on.
const PER_DEFAULT_POINTS = 150;
const PER_CCJ_POINTS = 220;
const PER_HIGH_UTILISATION_ACCOUNT_POINTS = 40;

// Matches negativeMarkers.ts's own HEAVY_SEARCH_THRESHOLD (>=20 recorded as
// a WARNING/INFO alert there) so this stays consistent with what the rest
// of the app already flags as a heavy search volume.
const HEAVY_SEARCH_THRESHOLD = 20;
const VERY_HEAVY_SEARCH_THRESHOLD = 50;
const HEAVY_SEARCH_POINTS = 30;
const VERY_HEAVY_SEARCH_EXTRA_POINTS = 20;

// An extra, small deduction for when defaults aren't just present but make
// up the majority of the accounts on file — a report where most accounts
// are defaulted reads as more systemically troubled than the same default
// count spread across many otherwise-healthy accounts.
const HIGH_DEFAULT_RATE_THRESHOLD = 0.5;
const HIGH_DEFAULT_RATE_POINTS = 60;

function bandFor(score: number, maxScore: number): string {
  const ratio = maxScore > 0 ? score / maxScore : 0;
  if (ratio >= 0.9) return "Excellent";
  if (ratio >= 0.75) return "Good";
  if (ratio >= 0.55) return "Fair";
  if (ratio >= 0.35) return "Poor";
  return "Very poor";
}

export function estimateCreditScore(bureau: CreditScoreBureau, input: CreditScoreEstimateInput): CreditScoreEstimate {
  const maxScore = BUREAU_MAX_SCORE[bureau];
  const scale = maxScore / 1000;
  const points = (raw: number) => Math.round(raw * scale);

  const factors: { label: string; impact: number }[] = [];

  factors.push({
    label: "Starting point (this app's own clean-report ceiling — see doc comment)",
    impact: points(1000 * STARTING_RATIO),
  });

  if (input.activeDefaultCount > 0) {
    factors.push({
      label: `${input.activeDefaultCount} active default${input.activeDefaultCount === 1 ? "" : "s"} still showing as owed`,
      impact: -points(input.activeDefaultCount * PER_DEFAULT_POINTS),
    });
  }

  if (input.unsatisfiedCcjCount > 0) {
    factors.push({
      label: `${input.unsatisfiedCcjCount} unsatisfied County Court Judgment${input.unsatisfiedCcjCount === 1 ? "" : "s"}`,
      impact: -points(input.unsatisfiedCcjCount * PER_CCJ_POINTS),
    });
  }

  if (input.highUtilisationAccountCount > 0) {
    factors.push({
      label: `${input.highUtilisationAccountCount} account${input.highUtilisationAccountCount === 1 ? "" : "s"} at 50%+ of its credit limit`,
      impact: -points(input.highUtilisationAccountCount * PER_HIGH_UTILISATION_ACCOUNT_POINTS),
    });
  }

  if (input.recentSearchCount >= VERY_HEAVY_SEARCH_THRESHOLD) {
    factors.push({
      label: `${input.recentSearchCount} searches recorded in the last 12 months (very high volume)`,
      impact: -points(HEAVY_SEARCH_POINTS + VERY_HEAVY_SEARCH_EXTRA_POINTS),
    });
  } else if (input.recentSearchCount >= HEAVY_SEARCH_THRESHOLD) {
    factors.push({
      label: `${input.recentSearchCount} searches recorded in the last 12 months (high volume)`,
      impact: -points(HEAVY_SEARCH_POINTS),
    });
  }

  const defaultRate = input.totalAccounts > 0 ? input.activeDefaultCount / input.totalAccounts : 0;
  if (input.activeDefaultCount > 0 && defaultRate >= HIGH_DEFAULT_RATE_THRESHOLD) {
    factors.push({
      label: `Most accounts on file (${input.activeDefaultCount} of ${input.totalAccounts}) are in default`,
      impact: -points(HIGH_DEFAULT_RATE_POINTS),
    });
  }

  const rawScore = factors.reduce((sum, f) => sum + f.impact, 0);
  const score = Math.min(maxScore, Math.max(0, Math.round(rawScore)));

  return { bureau, score, maxScore, band: bandFor(score, maxScore), factors };
}
