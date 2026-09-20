import { describe, expect, it, vi } from "vitest";
import { AuthenticatedRequest } from "../middleware/auth";
import {
  DISCLAIMER,
  estimateSimulatedScore,
  getSimulatedCreditFile,
  issueToken,
  verifyIdentity,
} from "./simulation.controller";

/** Minimal Express-shaped mocks — none of these handlers need anything
 * else from `res`, and the endpoints under test here never touch the
 * database (no `reportId` is passed to the credit-file endpoint), so
 * this stays a plain, DB-free unit test. */
function mockReqRes(body: Record<string, unknown>, user?: { id: string; email: string }) {
  const req = { body, user } as AuthenticatedRequest;
  const json = vi.fn();
  const res = { json } as unknown as Parameters<typeof verifyIdentity>[1];
  return { req, res, json };
}

describe("simulation endpoints always disclose that they are simulated", () => {
  it("verify-identity response includes simulated:true and a disclaimer", async () => {
    const { req, res, json } = mockReqRes({
      fullName: "Jordan Smith",
      dateOfBirth: "1988-03-14",
      addressLine: "12 Sample Street, Leeds",
    });

    await verifyIdentity(req, res);

    expect(json).toHaveBeenCalledTimes(1);
    const payload = json.mock.calls[0][0];
    expect(payload.simulated).toBe(true);
    expect(typeof payload.disclaimer).toBe("string");
    expect(payload.disclaimer.length).toBeGreaterThan(0);
    expect(payload.disclaimer).toBe(DISCLAIMER);
    expect(typeof payload.verificationId).toBe("string");
    expect(payload.verificationId.length).toBeGreaterThan(0);
    expect(payload.status).toBe("verified");
  });

  it("token response includes simulated:true and a disclaimer, and a non-JWT-shaped access_token", async () => {
    const { req, res, json } = mockReqRes({ verificationId: "some-verification-id" });

    await issueToken(req, res);

    const payload = json.mock.calls[0][0];
    expect(payload.simulated).toBe(true);
    expect(typeof payload.disclaimer).toBe("string");
    expect(payload.disclaimer.length).toBeGreaterThan(0);
    expect(payload.disclaimer).toBe(DISCLAIMER);
    expect(typeof payload.access_token).toBe("string");
    expect(payload.access_token.length).toBeGreaterThan(0);
    // Not JWT-shaped (no header.payload.signature dot structure), so it
    // can't be confused with this app's own real auth tokens.
    expect(payload.access_token.split(".").length).toBe(1);
    expect(payload.token_type).toBe("Bearer");
    expect(payload.expires_in).toBe(300);
  });

  it("credit-file response (no reportId — fictional demo dataset) includes simulated:true and a disclaimer, with no empty fields", async () => {
    const { req, res, json } = mockReqRes(
      { access_token: "sim_whatever" },
      { id: "user-1", email: "user@example.com" }
    );

    await getSimulatedCreditFile(req, res);

    const payload = json.mock.calls[0][0];
    expect(payload.simulated).toBe(true);
    expect(typeof payload.disclaimer).toBe("string");
    expect(payload.disclaimer.length).toBeGreaterThan(0);
    expect(payload.disclaimer).toBe(DISCLAIMER);
    expect(payload.score).toBeDefined();
    expect(typeof payload.score.value).toBe("number");
    expect(Array.isArray(payload.accounts)).toBe(true);
    expect(payload.accounts.length).toBeGreaterThan(0);
  });
}, 15000);

const CLEAN_STATS = { totalAccounts: 5, unsatisfiedCcjCount: 0, activeDefaultCount: 0, highUtilisationCount: 0, recentSearchCount: 0 };

describe("estimateSimulatedScore (pure, DB-free — delegates to services/analytics/creditScoreEstimate.ts)", () => {
  it("returns an EQUIFAX-scale (0-1000) score with a non-empty band/basis when there are no negative markers", () => {
    const result = estimateSimulatedScore(CLEAN_STATS);
    expect(result.maxValue).toBe(1000);
    expect(result.value).toBeGreaterThan(0);
    expect(typeof result.band).toBe("string");
    expect(result.band.length).toBeGreaterThan(0);
    expect(typeof result.basis).toBe("string");
    expect(result.basis.length).toBeGreaterThan(0);
  });

  it("penalises unsatisfied CCJs, active defaults, and high utilisation", () => {
    const clean = estimateSimulatedScore(CLEAN_STATS);
    const withCcj = estimateSimulatedScore({ ...CLEAN_STATS, unsatisfiedCcjCount: 1 });
    const withDefault = estimateSimulatedScore({ ...CLEAN_STATS, activeDefaultCount: 1 });
    const withUtilisation = estimateSimulatedScore({ ...CLEAN_STATS, highUtilisationCount: 1 });

    expect(withCcj.value).toBeLessThan(clean.value);
    expect(withDefault.value).toBeLessThan(clean.value);
    expect(withUtilisation.value).toBeLessThan(clean.value);
  });

  it("never returns a score below 0, even with heavy negative markers", () => {
    const result = estimateSimulatedScore({ totalAccounts: 10, unsatisfiedCcjCount: 10, activeDefaultCount: 10, highUtilisationCount: 10, recentSearchCount: 100 });
    expect(result.value).toBeGreaterThanOrEqual(0);
  });
});
