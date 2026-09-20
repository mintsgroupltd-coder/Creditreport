import crypto from "crypto";
import { Request, Response } from "express";
import { z } from "zod";
import { env } from "../config/env";
import { prisma } from "../config/prisma";
import { AuthenticatedRequest } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";
import { computeStatsAndMarkers } from "./reports.controller";
import { CreditScoreBureau, estimateCreditScore } from "../services/analytics/creditScoreEstimate";
import { logAudit } from "../utils/auditLog";

/**
 * Time-limited, revocable, read-only share links for a report — lets
 * someone WITHOUT an account (e.g. a solicitor or debt adviser) view a
 * trimmed summary of one report until it expires or the owner revokes
 * it. Token design mirrors the password-reset flow in auth.controller.ts
 * exactly: a random 32-byte token is handed to the requester once, and
 * only its SHA-256 hash is ever persisted — a database read alone can
 * never reconstruct a working link.
 */

const SHARE_TOKEN_BYTES = 32;
const MAX_EXPIRES_IN_HOURS = 24 * 30; // 30 days

function hashShareToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

const createShareLinkSchema = z.object({
  expiresInHours: z.number().int().min(1).max(MAX_EXPIRES_IN_HOURS),
});

/** Same ownership check used elsewhere (loadOwnedReport's findFirst
 * pattern) — throws 404 rather than leaking whether a report exists
 * under someone else's account. */
async function assertReportOwnership(reportId: string, userId: string): Promise<void> {
  const report = await prisma.report.findFirst({ where: { id: reportId, userId }, select: { id: true } });
  if (!report) throw new HttpError(404, "Report not found");
}

/**
 * POST /api/reports/:id/share-links — authenticated. Creates a new share
 * link for a report the caller owns. The raw token exists only in this
 * response's `url` — it is never stored or returned again, mirroring how
 * a password-reset link works.
 */
export async function createShareLink(req: AuthenticatedRequest, res: Response) {
  const reportId = req.params.id;
  await assertReportOwnership(reportId, req.user!.id);
  const { expiresInHours } = createShareLinkSchema.parse(req.body);

  const rawToken = crypto.randomBytes(SHARE_TOKEN_BYTES).toString("hex");
  const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);

  const link = await prisma.shareLink.create({
    data: {
      reportId,
      tokenHash: hashShareToken(rawToken),
      expiresAt,
    },
  });

  logAudit(req.user!.id, "CREATE_SHARE_LINK", { reportId, detail: `expires in ${expiresInHours}h` });

  res.status(201).json({
    id: link.id,
    url: `${env.frontendUrl}/shared/${rawToken}`,
    expiresAt: link.expiresAt,
  });
}

/**
 * GET /api/reports/:id/share-links — authenticated. Lists every share
 * link ever created for this report so the owner can see and manage what
 * they've shared. Never returns tokenHash — there is no route that lets
 * an authenticated owner recover a usable link after the fact; they only
 * ever get the raw token once, at creation time.
 */
export async function listShareLinks(req: AuthenticatedRequest, res: Response) {
  const reportId = req.params.id;
  await assertReportOwnership(reportId, req.user!.id);

  const shareLinks = await prisma.shareLink.findMany({
    where: { reportId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      createdAt: true,
      expiresAt: true,
      revokedAt: true,
      lastViewedAt: true,
      viewCount: true,
    },
  });

  res.json({ shareLinks });
}

/**
 * PATCH /api/reports/:id/share-links/:linkId/revoke — authenticated.
 * Idempotent: revoking an already-revoked link just returns its current
 * (already-revoked) state rather than erroring.
 */
export async function revokeShareLink(req: AuthenticatedRequest, res: Response) {
  const { id: reportId, linkId } = req.params;
  await assertReportOwnership(reportId, req.user!.id);

  const existing = await prisma.shareLink.findFirst({ where: { id: linkId, reportId } });
  if (!existing) throw new HttpError(404, "Share link not found");

  const link = existing.revokedAt
    ? existing
    : await prisma.shareLink.update({ where: { id: existing.id }, data: { revokedAt: new Date() } });

  res.json({
    id: link.id,
    createdAt: link.createdAt,
    expiresAt: link.expiresAt,
    revokedAt: link.revokedAt,
    lastViewedAt: link.lastViewedAt,
    viewCount: link.viewCount,
  });
}

/** A version of reports.controller.ts's loadOwnedReport that doesn't
 * filter by userId, since a public share-link viewer has no logged-in
 * user to check ownership against — ownership was already established
 * once, when the link was created. Kept local to this file rather than
 * exported from reports.controller.ts so that file stays untouched. */
async function loadReportById(reportId: string) {
  return prisma.report.findUnique({
    where: { id: reportId },
    include: {
      accounts: { include: { lender: true } },
      events: true,
      alerts: true,
    },
  });
}

type SharedReport = NonNullable<Awaited<ReturnType<typeof loadReportById>>>;
type SharedAccount = SharedReport["accounts"][number];
type SharedAlert = SharedReport["alerts"][number];

/**
 * GET /api/shared/:token — UNAUTHENTICATED. This is the whole point of
 * the feature: no Authorization header, no req.user. The incoming raw
 * token is hashed and looked up by tokenHash; an invalid, expired, or
 * revoked link all produce the exact same generic 404 so a prospective
 * attacker learns nothing about *why* a given token doesn't work.
 *
 * The response is deliberately a TRIMMED, read-only view of the report —
 * meaningfully narrower than the authenticated getReport() response in
 * reports.controller.ts. It excludes:
 *   - rawText and anything derived from it (the document inspector's
 *     pins) — a solicitor/adviser typically needs the analysis, not the
 *     raw extracted document dump;
 *   - dateOfBirth and postal addresses — full DOB/address aren't needed
 *     to review the credit picture and are exactly the kind of personal
 *     data that shouldn't ride along on a link that could end up
 *     forwarded further than intended;
 *   - identityCheck, events (raw CCJ/search event rows), dispute records,
 *     and the account/alert id-cross-referencing (relatedAccountIds) —
 *     all either account-management detail or derived from data already
 *     excluded above.
 * Everything else (bureau, summary, risk level, stats, negative markers,
 * the illustrative credit score estimate, and a close-to-authenticated
 * shape for accounts/alerts) is included so the shared view is still
 * genuinely useful for a read-only review.
 */
export async function getSharedReport(req: Request, res: Response) {
  const rawToken = req.params.token;
  const genericMessage = "This share link is invalid, expired, or has been revoked.";
  const tokenHash = hashShareToken(rawToken);

  const shareLink = await prisma.shareLink.findUnique({ where: { tokenHash } });
  if (!shareLink || shareLink.revokedAt || shareLink.expiresAt.getTime() < Date.now()) {
    throw new HttpError(404, genericMessage);
  }

  await prisma.shareLink.update({
    where: { id: shareLink.id },
    data: { viewCount: { increment: 1 }, lastViewedAt: new Date() },
  });

  const report = await loadReportById(shareLink.reportId);
  if (!report) throw new HttpError(404, genericMessage);

  const { stats, negativeMarkers } = computeStatsAndMarkers(report);

  res.json({
    bureau: report.bureau,
    sourceFileName: report.sourceFileName,
    uploadedAt: report.uploadedAt,
    applicantName: report.applicantName,
    riskLevel: report.riskLevel ?? "LOW",
    summary: report.summary ?? "No summary was generated for this report.",
    stats,
    negativeMarkers,
    // Same illustrative-only estimate as the authenticated view — see
    // creditScoreEstimate.ts's doc comment.
    creditScoreEstimate: estimateCreditScore(
      report.bureau === "UNKNOWN" ? "EQUIFAX" : (report.bureau as CreditScoreBureau),
      {
        totalAccounts: stats.totalAccounts,
        activeDefaultCount: negativeMarkers.activeDefaultCount,
        unsatisfiedCcjCount: negativeMarkers.unsatisfiedCcjCount,
        highUtilisationAccountCount: negativeMarkers.highUtilisationCount,
        recentSearchCount: negativeMarkers.recentSearchCount,
      }
    ),
    accounts: report.accounts.map((a: SharedAccount) => ({
      id: a.id,
      lenderName: a.lender.name,
      accountType: a.accountType,
      status: a.status,
      currentBalance: a.currentBalance,
      creditLimit: a.creditLimit,
      defaultDate: a.defaultDate,
      defaultBalance: a.defaultBalance,
    })),
    alerts: report.alerts.map((a: SharedAlert) => ({
      type: a.type,
      severity: a.severity,
      message: a.message,
      createdAt: a.createdAt,
    })),
  });
}
