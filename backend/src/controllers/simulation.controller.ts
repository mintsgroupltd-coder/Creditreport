import crypto from "crypto";
import { Response } from "express";
import { z } from "zod";
import { AuthenticatedRequest } from "../middleware/auth";
import { estimateCreditScore } from "../services/analytics/creditScoreEstimate";
// `loadOwnedReport`/`computeStatsAndMarkers` are loaded with a dynamic
// import below (only on the `reportId` branch) rather than a top-level
// import — reports.controller.ts pulls in the Prisma client at module
// load time, and this file's own unit tests never touch the database,
// so this keeps them DB-free.

/**
 * "Equifax credit check portal" SIMULATION — read this before touching
 * anything in this file.
 *
 * This app has NO real integration with Equifax, or with any other UK
 * credit reference agency's live systems. Nothing here calls out to
 * Equifax, holds Equifax credentials, or knows a real Equifax API
 * endpoint. Every function in this file is a self-contained illustration,
 * built entirely from this app's own already-uploaded, already-consented
 * user data (or a clearly fictional demo dataset), of what a 3-step
 * identity-verification-then-OAuth2-token-then-credit-file-request flow
 * against a live bureau might look like from the outside.
 *
 * Two rules future maintainers must not "helpfully" relax:
 *
 * 1. Every response object returned by every endpoint in this file MUST
 *    include `simulated: true` and a non-empty `disclaimer` string
 *    (see DISCLAIMER below). This is not cosmetic — it's what keeps a
 *    user (or a screenshot, or a support ticket) from mistaking this
 *    demo for a real Equifax connection. Do not add a code path, a
 *    "lite" response, an error shape, or a cached/short-circuited
 *    response that omits either field.
 *
 * 2. Do not make the shapes here more "realistic" by copying real
 *    Equifax endpoint paths, real Equifax product/API names, real
 *    Equifax corporate identifiers, or Equifax's visual branding
 *    (logos, colour marks, wordmarks). The access token below is
 *    deliberately NOT JWT-shaped, specifically so it can't be confused
 *    with either a real bureau token or this app's own real auth JWTs
 *    (see utils/jwt.ts). Referring to Equifax by name in comments/copy
 *    to explain what's being demonstrated is fine and intended;
 *    reproducing its actual API contract or identity is not.
 */

export const DISCLAIMER =
  "Simulated response for demonstration only — this app has no real connection to Equifax or any credit reference agency's live systems.";

/** Artificial network-style delay so the demo *feels* like a round trip
 * to a remote bureau, without ever making one. Bounds are inclusive. */
function simulatedNetworkDelay(minMs = 600, maxMs = 900): Promise<void> {
  const delayMs = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

/** Opaque, deliberately non-JWT "access token" for the simulated OAuth2
 * step. Plain random hex, so it can never be mistaken for a real bureau
 * token or for this app's own real (JWT) auth tokens. */
function generateSimulatedAccessToken(): string {
  return `sim_${crypto.randomBytes(24).toString("hex")}`;
}

const verifyIdentitySchema = z.object({
  fullName: z.string().min(1, "fullName is required"),
  dateOfBirth: z.string().min(1, "dateOfBirth is required"),
  addressLine: z.string().min(1, "addressLine is required"),
});

/** Step 1 of the demo wizard. Always "verifies" any well-formed input —
 * there is no real identity check here, nothing is sent anywhere, this
 * only demonstrates what such a step might look like in a UI. */
export async function verifyIdentity(req: AuthenticatedRequest, res: Response) {
  verifyIdentitySchema.parse(req.body);
  await simulatedNetworkDelay();

  res.json({
    simulated: true,
    disclaimer: DISCLAIMER,
    verificationId: crypto.randomUUID(),
    status: "verified",
  });
}

const tokenSchema = z.object({
  verificationId: z.string().min(1, "verificationId is required"),
});

/** Step 2 of the demo wizard: a fake OAuth2-shaped token issuance. The
 * token is opaque random data, not a real credential for anything. */
export async function issueToken(req: AuthenticatedRequest, res: Response) {
  tokenSchema.parse(req.body);
  await simulatedNetworkDelay();

  res.json({
    simulated: true,
    disclaimer: DISCLAIMER,
    access_token: generateSimulatedAccessToken(),
    token_type: "Bearer",
    expires_in: 300,
  });
}

const creditFileSchema = z.object({
  access_token: z.string().min(1, "access_token is required"),
  reportId: z.string().min(1).optional(),
});

export interface SimulatedScore {
  value: number;
  band: string;
  maxValue: number;
  basis: string;
}

export interface SimulatedAccount {
  lenderName: string;
  accountType: string;
  status: string;
  balance: number;
}

export interface SimulatedCreditFile {
  subjectName: string;
  score: SimulatedScore;
  accounts: SimulatedAccount[];
}

/**
 * Wraps this app's own real illustrative estimator
 * (services/analytics/creditScoreEstimate.ts#estimateCreditScore) on the
 * EQUIFAX 0–1000 scale, purely because this simulation is themed around
 * Equifax — the estimate itself is still this app's own transparent,
 * point-deduction figure, not a real Equifax score. See that file's doc
 * comment for why it deliberately doesn't try to reproduce a real
 * bureau's actual model.
 */
export function estimateSimulatedScore(stats: {
  totalAccounts: number;
  unsatisfiedCcjCount: number;
  activeDefaultCount: number;
  highUtilisationCount: number;
  recentSearchCount: number;
}): SimulatedScore {
  const estimate = estimateCreditScore("EQUIFAX", {
    totalAccounts: stats.totalAccounts,
    activeDefaultCount: stats.activeDefaultCount,
    unsatisfiedCcjCount: stats.unsatisfiedCcjCount,
    highUtilisationAccountCount: stats.highUtilisationCount,
    recentSearchCount: stats.recentSearchCount,
  });
  return {
    value: estimate.score,
    band: estimate.band,
    maxValue: estimate.maxScore,
    basis: "Illustrative estimate from this app's own analysis of your uploaded report (see services/analytics/creditScoreEstimate.ts) — not a real bureau score.",
  };
}

/** Clearly-fictional canned demo dataset used when no reportId is given,
 * so the response never has an empty/undefined field that could look
 * like a real bureau silently returning nothing. */
function fictionalDemoCreditFile(): SimulatedCreditFile {
  return {
    subjectName: "Alex Demo",
    score: {
      value: 710,
      band: "Good",
      maxValue: 1000,
      basis: "Entirely fictional demo figure — no real person or data behind it.",
    },
    accounts: [
      { lenderName: "Demo Bank plc", accountType: "Credit Card", status: "ACTIVE", balance: 850 },
      { lenderName: "Fictional Finance Co", accountType: "Personal Loan", status: "ACTIVE", balance: 4200 },
      { lenderName: "Sample Mobile Ltd", accountType: "Mobile Contract", status: "SETTLED", balance: 0 },
    ],
  };
}

/** Builds the demo credit-file payload from a report this user already
 * owns and already uploaded — no new data is fetched from anywhere, this
 * only re-presents figures the app already computed. */
function creditFileFromOwnReport(
  applicantName: string | null,
  stats: { totalAccounts: number; activeDefaultCount: number; unsatisfiedCcjCount: number; highUtilisationCount: number; recentSearchCount: number },
  totals: { ccjTotalAmount: number; activeDefaultTotal: number }
): SimulatedCreditFile {
  const accounts: SimulatedAccount[] = [];
  if (stats.activeDefaultCount > 0) {
    accounts.push({
      lenderName: "Your active default(s)",
      accountType: "Defaulted account(s)",
      status: "DEFAULT",
      balance: totals.activeDefaultTotal,
    });
  }
  if (stats.unsatisfiedCcjCount > 0) {
    accounts.push({
      lenderName: "Court judgment(s) on file",
      accountType: "CCJ",
      status: "UNSATISFIED",
      balance: totals.ccjTotalAmount,
    });
  }
  if (accounts.length === 0) {
    accounts.push({ lenderName: "No negative markers on this report", accountType: "N/A", status: "CLEAN", balance: 0 });
  }

  return {
    subjectName: applicantName ?? "Your uploaded report",
    score: estimateSimulatedScore(stats),
    accounts,
  };
}

/**
 * Step 3 of the demo wizard. Requires this app's own real auth (a real
 * logged-in user of THIS app), not any credential from Equifax — the
 * `access_token` field is only the fake token minted by issueToken()
 * above, checked here for shape only, never sent anywhere.
 *
 * If `reportId` is supplied and belongs to the authenticated user's own
 * uploaded reports, the response is built from that report's own
 * already-computed stats (still just this user's own data, already in
 * this app). Otherwise a clearly-fictional canned demo dataset is
 * returned instead.
 */
export async function getSimulatedCreditFile(req: AuthenticatedRequest, res: Response) {
  const { reportId } = creditFileSchema.parse(req.body);
  await simulatedNetworkDelay();

  let creditFile: SimulatedCreditFile;
  if (reportId) {
    const { loadOwnedReport, computeStatsAndMarkers } = await import("./reports.controller");
    const report = await loadOwnedReport(reportId, req.user!.id);
    const { stats, negativeMarkers } = computeStatsAndMarkers(report);
    creditFile = creditFileFromOwnReport(
      report.applicantName,
      {
        totalAccounts: stats.totalAccounts,
        activeDefaultCount: negativeMarkers.activeDefaultCount,
        unsatisfiedCcjCount: negativeMarkers.unsatisfiedCcjCount,
        highUtilisationCount: negativeMarkers.highUtilisationCount,
        recentSearchCount: negativeMarkers.recentSearchCount,
      },
      { ccjTotalAmount: negativeMarkers.ccjTotalAmount, activeDefaultTotal: negativeMarkers.activeDefaultTotal }
    );
  } else {
    creditFile = fictionalDemoCreditFile();
  }

  res.json({
    simulated: true,
    disclaimer: DISCLAIMER,
    score: creditFile.score,
    accounts: creditFile.accounts,
  });
}
