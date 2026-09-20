import { describe, expect, it } from "vitest";
import { estimateCreditScore, CreditScoreBureau, CreditScoreEstimateInput } from "./creditScoreEstimate";

const BUREAUS: { bureau: CreditScoreBureau; maxScore: number }[] = [
  { bureau: "EXPERIAN", maxScore: 999 },
  { bureau: "EQUIFAX", maxScore: 1000 },
  { bureau: "TRANSUNION", maxScore: 710 },
];

function cleanInput(overrides: Partial<CreditScoreEstimateInput> = {}): CreditScoreEstimateInput {
  return {
    totalAccounts: 5,
    activeDefaultCount: 0,
    unsatisfiedCcjCount: 0,
    highUtilisationAccountCount: 0,
    recentSearchCount: 2,
    ...overrides,
  };
}

describe("estimateCreditScore", () => {
  it("scores a clean report near the top of its band, on each bureau's own scale", () => {
    for (const { bureau, maxScore } of BUREAUS) {
      const result = estimateCreditScore(bureau, cleanInput());
      expect(result.bureau).toBe(bureau);
      expect(result.maxScore).toBe(maxScore);
      expect(result.score).toBeGreaterThanOrEqual(Math.round(maxScore * 0.9));
      expect(result.score).toBeLessThanOrEqual(maxScore);
      expect(result.band).toBe("Excellent");
    }
  });

  it("visibly reduces the score for an active default", () => {
    for (const { bureau } of BUREAUS) {
      const clean = estimateCreditScore(bureau, cleanInput());
      const withDefault = estimateCreditScore(bureau, cleanInput({ activeDefaultCount: 1 }));
      expect(withDefault.score).toBeLessThan(clean.score);
      expect(withDefault.factors.some((f) => f.label.includes("active default") && f.impact < 0)).toBe(true);
    }
  });

  it("visibly reduces the score for an unsatisfied CCJ, more than a single default does", () => {
    for (const { bureau } of BUREAUS) {
      const withDefault = estimateCreditScore(bureau, cleanInput({ activeDefaultCount: 1 }));
      const withCcj = estimateCreditScore(bureau, cleanInput({ unsatisfiedCcjCount: 1 }));
      expect(withCcj.score).toBeLessThan(estimateCreditScore(bureau, cleanInput()).score);
      expect(withCcj.factors.some((f) => f.label.includes("Judgment") && f.impact < 0)).toBe(true);
      // A CCJ is documented as a heavier deduction than a single default.
      expect(withCcj.score).toBeLessThan(withDefault.score);
    }
  });

  it("visibly reduces the score for high-utilisation accounts", () => {
    for (const { bureau } of BUREAUS) {
      const clean = estimateCreditScore(bureau, cleanInput());
      const withHighUtil = estimateCreditScore(bureau, cleanInput({ highUtilisationAccountCount: 2 }));
      expect(withHighUtil.score).toBeLessThan(clean.score);
      expect(withHighUtil.factors.some((f) => f.label.includes("credit limit") && f.impact < 0)).toBe(true);
    }
  });

  it("never goes below 0 even for a very heavily negative report", () => {
    for (const { bureau } of BUREAUS) {
      const result = estimateCreditScore(
        bureau,
        cleanInput({
          totalAccounts: 3,
          activeDefaultCount: 10,
          unsatisfiedCcjCount: 10,
          highUtilisationAccountCount: 10,
          recentSearchCount: 100,
        })
      );
      expect(result.score).toBe(0);
      expect(result.band).toBe("Very poor");
    }
  });

  it("never exceeds maxScore, even for the cleanest possible input", () => {
    for (const { bureau, maxScore } of BUREAUS) {
      const result = estimateCreditScore(bureau, cleanInput({ totalAccounts: 0, recentSearchCount: 0 }));
      expect(result.score).toBeLessThanOrEqual(maxScore);
      expect(result.score).toBeGreaterThan(0);
    }
  });

  it("adds a heavy-search-volume deduction only once the recognised threshold is crossed", () => {
    const below = estimateCreditScore("EXPERIAN", cleanInput({ recentSearchCount: 19 }));
    const at = estimateCreditScore("EXPERIAN", cleanInput({ recentSearchCount: 20 }));
    expect(below.factors.some((f) => f.label.includes("searches"))).toBe(false);
    expect(at.factors.some((f) => f.label.includes("searches"))).toBe(true);
    expect(at.score).toBeLessThan(below.score);
  });
});
