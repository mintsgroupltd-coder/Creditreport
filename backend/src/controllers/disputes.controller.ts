import { Response } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { AuthenticatedRequest } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";
import { ICO_CONTACT } from "../data/contacts";
import { renderTrackingSheetPdf, TrackingMilestone } from "../services/pdf/trackingSheetPdf";

/** How long to wait before following up, and whether that's a real legal
 * deadline or just a sensible nudge:
 *  - Letters to a credit reference agency (identity/general accuracy
 *    templates, and "auto" when it's addressed to the bureau) fall under
 *    the credit reference agency's own statutory duty to tell the
 *    objector what it did within 28 days (Consumer Credit Act 1974
 *    s.159(2)) — a real, verbatim-checked deadline.
 *  - A formal notice of correction has its own, later statutory
 *    checkpoint: the agency must confirm receipt and intent to comply
 *    within 28 days of the notice (s.159(4)).
 *  - Letters to a court (CCJ) or a lender (debt validation) have no fixed
 *    statutory reply window in UK law, so this is only a suggested
 *    follow-up point, not a legal deadline.
 *
 * Escalation for a missed statutory deadline (s.159(5)) goes to the
 * Information Commissioner's Office (ICO) for an individual — NOT the
 * Financial Ombudsman Service, which is a separate route for complaints
 * about a regulated firm's conduct. See backend/src/data/contacts.ts. */
const DEADLINE_DAYS: Record<string, { days: number; basis: "statutory" | "advisory" }> = {
  identity: { days: 28, basis: "statutory" },
  general_accuracy: { days: 28, basis: "statutory" },
  auto: { days: 28, basis: "statutory" },
  notice_of_correction: { days: 28, basis: "statutory" },
  ccj: { days: 21, basis: "advisory" },
  default_validation: { days: 21, basis: "advisory" },
};

const TEMPLATE_LABELS: Record<string, string> = {
  auto: "Auto (identity/CCJ combined)",
  identity: "Identity / DOB / name correction",
  ccj: "CCJ satisfaction request",
  default_validation: "Debt validation (active default)",
  general_accuracy: "General accuracy dispute",
  notice_of_correction: "Formal statutory notice of correction (s.159)",
};

/** The three templates addressed to a credit reference agency under
 * CCA 1974 s.159 — these are the ones where a missed statutory deadline
 * escalates to the ICO. CCJ and debt-validation letters go to a court or
 * a lender instead and have no s.159 escalation route. */
const CRA_STATUTORY_TEMPLATES = new Set(["auto", "identity", "general_accuracy", "notice_of_correction"]);

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function ukDate(date: Date): string {
  return date.toLocaleDateString("en-GB");
}

const createSchema = z.object({
  reportId: z.string().min(1),
  templateId: z.string().min(1),
  recipient: z.string().min(1).max(200),
});

export async function createDispute(req: AuthenticatedRequest, res: Response) {
  const { reportId, templateId, recipient } = createSchema.parse(req.body);

  const report = await prisma.report.findFirst({ where: { id: reportId, userId: req.user!.id } });
  if (!report) throw new HttpError(404, "Report not found");

  const sentAt = new Date();
  const deadlineSpec = DEADLINE_DAYS[templateId];
  const responseDeadline = deadlineSpec ? new Date(sentAt.getTime() + deadlineSpec.days * 24 * 60 * 60 * 1000) : null;

  const record = await prisma.disputeRecord.create({
    data: {
      reportId,
      userId: req.user!.id,
      templateId,
      recipient,
      sentAt,
      responseDeadline,
      deadlineBasis: deadlineSpec?.basis ?? null,
    },
  });

  res.status(201).json(record);
}

export async function listDisputes(req: AuthenticatedRequest, res: Response) {
  const reportId = req.query.reportId as string | undefined;
  if (!reportId) throw new HttpError(400, "reportId query parameter is required");

  const report = await prisma.report.findFirst({ where: { id: reportId, userId: req.user!.id } });
  if (!report) throw new HttpError(404, "Report not found");

  const disputes = await prisma.disputeRecord.findMany({
    where: { reportId, userId: req.user!.id },
    orderBy: { sentAt: "desc" },
  });
  res.json({ disputes });
}

const updateSchema = z.object({
  status: z.enum(["SENT", "RESOLVED", "NO_RESPONSE"]).optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export async function updateDispute(req: AuthenticatedRequest, res: Response) {
  const existing = await prisma.disputeRecord.findFirst({ where: { id: req.params.id, userId: req.user!.id } });
  if (!existing) throw new HttpError(404, "Dispute record not found");

  const { status, notes } = updateSchema.parse(req.body);

  const record = await prisma.disputeRecord.update({
    where: { id: existing.id },
    data: {
      ...(status ? { status } : {}),
      ...(status === "RESOLVED" ? { resolvedAt: new Date() } : {}),
      ...(notes !== undefined ? { notes: notes?.trim() || null } : {}),
    },
  });
  res.json(record);
}

/** Builds the dated checkpoints for a dispute's PDF tracking sheet.
 * Statutory CRA disputes get a second, later checkpoint — when the
 * deadline is missed, escalation to the ICO becomes available (s.159(5)
 * and (8)); a notice of correction cites the confirm-receipt deadline
 * under s.159(4) instead of the initial investigation deadline. Advisory
 * (court/lender) letters have no fixed deadline and no s.159 escalation
 * route, so they get a plain follow-up suggestion instead. */
function buildMilestones(templateId: string, sentAt: Date, deadlineBasis: string | null): TrackingMilestone[] {
  const spec = DEADLINE_DAYS[templateId];
  const milestones: TrackingMilestone[] = [
    { label: "Letter sent", date: ukDate(sentAt), note: "Keep your proof of posting with this sheet." },
  ];

  if (!spec) return milestones;

  const deadline = addDays(sentAt, spec.days);

  if (deadlineBasis === "statutory" && CRA_STATUTORY_TEMPLATES.has(templateId)) {
    const isNoticeOfCorrection = templateId === "notice_of_correction";
    milestones.push({
      label: isNoticeOfCorrection ? "Agency must confirm receipt (s.159(4))" : "Agency must respond (s.159(2))",
      date: ukDate(deadline),
      note: isNoticeOfCorrection
        ? "They must confirm receipt and intent to comply within 28 days of the notice."
        : "They must tell you what they did — removed, amended, or no action — within 28 days.",
    });
    milestones.push({
      label: "Escalation to the ICO becomes available",
      date: ukDate(deadline),
      note: `If they miss this deadline, or you disagree with their decision, you may apply to ${ICO_CONTACT.name} (s.159(5)/(8)) — not the Financial Ombudsman Service, which covers a different kind of complaint.`,
    });
  } else {
    milestones.push({
      label: "Suggested follow-up",
      date: ukDate(deadline),
      note: "There's no fixed statutory deadline for this letter type — this is a reasonable point to chase a reply if you haven't heard back.",
    });
  }

  return milestones;
}

export async function getTrackingSheetPdf(req: AuthenticatedRequest, res: Response) {
  const dispute = await prisma.disputeRecord.findFirst({
    where: { id: req.params.id, userId: req.user!.id },
    include: { report: { select: { sourceFileName: true, bureau: true } } },
  });
  if (!dispute) throw new HttpError(404, "Dispute record not found");

  const service = typeof req.query.service === "string" ? req.query.service : undefined;
  const cost = typeof req.query.cost === "string" ? req.query.cost : undefined;

  const doc = renderTrackingSheetPdf({
    recipient: dispute.recipient,
    templateLabel: TEMPLATE_LABELS[dispute.templateId] ?? dispute.templateId,
    sentDate: ukDate(dispute.sentAt),
    service,
    cost,
    reportLabel: `${dispute.report.bureau} — ${dispute.report.sourceFileName}`,
    milestones: buildMilestones(dispute.templateId, dispute.sentAt, dispute.deadlineBasis),
  });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="postage-record-${dispute.id}.pdf"`);
  doc.pipe(res);
  doc.end();
}
