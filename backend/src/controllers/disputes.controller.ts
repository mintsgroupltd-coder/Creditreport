import { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { env } from "../config/env";
import { AuthenticatedRequest } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";
import { sendMail } from "../utils/mailer";
import { FOS_CONTACT, ICO_CONTACT } from "../data/contacts";
import { buildDisputeLetterInput, buildDisputeSchedule, loadOwnedReport } from "./reports.controller";
import { buildDisputeLetterParts, DisputeTemplateId } from "../services/analytics/disputeTextGenerator";
import { checkProfileIdentityMatch } from "../services/analytics/identityCheck";
import { selectDisputesNeedingReminder, selectUsersNeedingRecheckReminder } from "../services/analytics/disputeReminders";
import { renderEscalationPackPdf } from "../services/pdf/escalationPackPdf";
import { renderTrackingSheetPdf, TrackingMilestone, POSTAL_SERVICES } from "../services/pdf/trackingSheetPdf";
import { renderDisputeLetterPdf, EnvelopeSize, SignatureMode } from "../services/pdf/disputeLetterPdf";
import { pdfDocToBuffer } from "../services/pdf/pdfToBuffer";
import { buildDisputePackZip } from "../services/export/disputePackZip";
import { logAudit } from "../utils/auditLog";

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

/** Which regulator's contact details belong in the escalation pack for a
 * given template — deliberately not a single hardcoded choice, because
 * the two regulators this app knows about cover genuinely different
 * things (see backend/src/data/contacts.ts):
 *  - The CRA-statutory templates (identity/general_accuracy/auto/notice
 *    of correction) are s.159 disputes with a credit reference agency —
 *    their escalation authority is the ICO.
 *  - A debt-validation letter is addressed to a lender about how it's
 *    reporting an account — if it doesn't respond, that's a conduct
 *    complaint about a regulated firm, which is the FOS's remit.
 *  - A CCJ letter is addressed to a court, not a regulator — there's no
 *    ICO/FOS escalation route for that, so this pack doesn't apply and
 *    getEscalationPackPdf below refuses it rather than pointing to the
 *    wrong authority. */
function escalationAuthorityFor(templateId: string) {
  if (CRA_STATUTORY_TEMPLATES.has(templateId)) return ICO_CONTACT;
  if (templateId === "default_validation") return FOS_CONTACT;
  return null;
}

export async function getEscalationPackPdf(req: AuthenticatedRequest, res: Response) {
  const dispute = await prisma.disputeRecord.findFirst({ where: { id: req.params.id, userId: req.user!.id } });
  if (!dispute) throw new HttpError(404, "Dispute record not found");

  const authority = escalationAuthorityFor(dispute.templateId);
  if (!authority) {
    throw new HttpError(
      400,
      "There's no ICO/FOS escalation pack for a CCJ dispute — that goes through the issuing court's own process instead. See 'Useful contacts' on the report for the Civil National Business Centre's details."
    );
  }

  const report = await loadOwnedReport(dispute.reportId, req.user!.id);
  const templateId = dispute.templateId as DisputeTemplateId;

  const input = await buildDisputeLetterInput(report, req.user!.id);
  const parts = buildDisputeLetterParts(input, templateId);
  const schedule = buildDisputeSchedule(input);
  const milestones = buildMilestones(dispute.templateId, dispute.sentAt, dispute.deadlineBasis);

  const profile = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { fullName: true, dateOfBirth: true, identityConfirmedAt: true },
  });
  const identityCheck = checkProfileIdentityMatch(
    { applicantName: report.applicantName, dateOfBirth: report.dateOfBirth ? report.dateOfBirth.toISOString().slice(0, 10) : null },
    {
      fullName: profile?.fullName ?? null,
      dateOfBirth: profile?.dateOfBirth ? profile.dateOfBirth.toISOString().slice(0, 10) : null,
      confirmed: Boolean(profile?.identityConfirmedAt),
    }
  );

  const doc = renderEscalationPackPdf({
    reportLabel: `${report.bureau} — ${report.sourceFileName}`,
    templateLabel: TEMPLATE_LABELS[dispute.templateId] ?? dispute.templateId,
    recipient: dispute.recipient,
    sentDate: ukDate(dispute.sentAt),
    status: dispute.status,
    deadlinePassed: Boolean(dispute.responseDeadline && dispute.responseDeadline.getTime() < Date.now()),
    notes: dispute.notes,
    findingMessages: report.alerts.map((a: { message: string }) => a.message),
    identityCheckMessage: identityCheck.overallMatch === false ? identityCheck.message : null,
    letterParts: parts,
    schedule,
    milestones,
    authority,
  });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="escalation-pack-${dispute.id}.pdf"`);
  doc.pipe(res);
  doc.end();
}

const trackingSheetQuerySchema = z.object({
  // A fixed set of real Royal Mail services rather than free text — see
  // POSTAL_SERVICES's own doc comment in trackingSheetPdf.ts for why.
  service: z.enum(POSTAL_SERVICES).optional(),
  cost: z.string().max(30).optional(),
});

export async function getTrackingSheetPdf(req: AuthenticatedRequest, res: Response) {
  const dispute = await prisma.disputeRecord.findFirst({
    where: { id: req.params.id, userId: req.user!.id },
    include: { report: { select: { sourceFileName: true, bureau: true } } },
  });
  if (!dispute) throw new HttpError(404, "Dispute record not found");

  const { service, cost } = trackingSheetQuerySchema.parse(req.query);

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

const sendDisputeEmailSchema = z.object({
  to: z.string().email(),
  templateId: z.string().min(1),
  envelope: z.enum(["none", "c5", "dl"]).optional(),
  signatureMode: z.enum(["digital", "blank"]).optional(),
});

/**
 * Emails a dispute letter to an address the user types in themselves, in
 * direct response to one explicit "Send" click after they've reviewed the
 * exact PDF they're about to send (see DisputeTracker.tsx's inline confirm
 * panel). This is a deliberately bigger trust step than just generating a
 * PDF — see the README's "Extending this" section, which called this out
 * and left it unbuilt until that safeguard was in place — so this handler
 * is synchronous, single-shot, and never triggered by anything other than
 * that one authenticated HTTP call: no queue, no retry, no scheduler.
 *
 * Builds the letter the same way getDisputePdf (reports.controller.ts)
 * does, just without a correctionStatement override — there's no field
 * for one in the confirm panel, so a notice-of-correction letter is sent
 * with whatever statement was last generated into its own text.
 */
export async function sendDisputeEmail(req: AuthenticatedRequest, res: Response) {
  const dispute = await prisma.disputeRecord.findFirst({ where: { id: req.params.id, userId: req.user!.id } });
  if (!dispute) throw new HttpError(404, "Dispute record not found");

  const { to, templateId, envelope, signatureMode } = sendDisputeEmailSchema.parse(req.body);

  const report = await loadOwnedReport(dispute.reportId, req.user!.id);
  const input = await buildDisputeLetterInput(report, req.user!.id);
  const parts = buildDisputeLetterParts(input, templateId as DisputeTemplateId);
  const schedule = buildDisputeSchedule(input);

  const doc = renderDisputeLetterPdf({
    parts,
    envelope: (envelope ?? "none") as EnvelopeSize,
    signatureMode: (signatureMode ?? "digital") as SignatureMode,
    schedule,
  });
  const buffer = await pdfDocToBuffer(doc);

  // sendMail resolving (rather than throwing) is treated as "the user's
  // send action completed" even when SMTP isn't configured — in that case
  // it just logs the content server-side instead of delivering it (see
  // mailer.ts), the same non-fatal behaviour the forgot-password flow
  // already relies on. There's no separate "delivery confirmed" signal to
  // wait for beyond that.
  await sendMail({
    to,
    subject: "Your credit report dispute letter",
    text:
      "Attached is the dispute letter you asked to send from Credit Report Analyzer.\n\n" +
      "This was sent by you, from your own account — nothing is sent automatically or without your review.",
    attachments: [{ filename: "dispute-letter.pdf", content: buffer }],
  });

  const updated = await prisma.disputeRecord.update({
    where: { id: dispute.id },
    data: { emailSentAt: new Date(), emailSentTo: to },
  });

  logAudit(req.user!.id, "SEND_DISPUTE_EMAIL", { reportId: dispute.reportId, detail: `to ${to}` });

  res.json(updated);
}

/**
 * Bundles the same three PDFs the individual download buttons already
 * produce (letter, escalation pack when one applies, postage tracking
 * sheet) into one zip, using each dispute's own logged templateId — same
 * defaults (envelope "none", signature "digital") as a plain PDF download
 * with no query params. The escalation pack is included only when this
 * template actually has an ICO/FOS escalation route (see
 * escalationAuthorityFor above); a CCJ dispute's zip simply omits it.
 */
export async function getDisputePackZip(req: AuthenticatedRequest, res: Response) {
  const dispute = await prisma.disputeRecord.findFirst({
    where: { id: req.params.id, userId: req.user!.id },
    include: { report: { select: { sourceFileName: true, bureau: true } } },
  });
  if (!dispute) throw new HttpError(404, "Dispute record not found");

  const templateId = dispute.templateId as DisputeTemplateId;
  const report = await loadOwnedReport(dispute.reportId, req.user!.id);
  const input = await buildDisputeLetterInput(report, req.user!.id);
  const parts = buildDisputeLetterParts(input, templateId);
  const schedule = buildDisputeSchedule(input);
  const milestones = buildMilestones(dispute.templateId, dispute.sentAt, dispute.deadlineBasis);

  const letterDoc = renderDisputeLetterPdf({ parts, envelope: "none", signatureMode: "digital", schedule });
  const letterPdf = await pdfDocToBuffer(letterDoc);

  const trackingDoc = renderTrackingSheetPdf({
    recipient: dispute.recipient,
    templateLabel: TEMPLATE_LABELS[dispute.templateId] ?? dispute.templateId,
    sentDate: ukDate(dispute.sentAt),
    reportLabel: `${dispute.report.bureau} — ${dispute.report.sourceFileName}`,
    milestones,
  });
  const trackingSheetPdf = await pdfDocToBuffer(trackingDoc);

  const authority = escalationAuthorityFor(dispute.templateId);
  let escalationPdf: Buffer | null = null;
  if (authority) {
    const profile = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { fullName: true, dateOfBirth: true, identityConfirmedAt: true },
    });
    const identityCheck = checkProfileIdentityMatch(
      { applicantName: report.applicantName, dateOfBirth: report.dateOfBirth ? report.dateOfBirth.toISOString().slice(0, 10) : null },
      {
        fullName: profile?.fullName ?? null,
        dateOfBirth: profile?.dateOfBirth ? profile.dateOfBirth.toISOString().slice(0, 10) : null,
        confirmed: Boolean(profile?.identityConfirmedAt),
      }
    );
    const escalationDoc = renderEscalationPackPdf({
      reportLabel: `${report.bureau} — ${report.sourceFileName}`,
      templateLabel: TEMPLATE_LABELS[dispute.templateId] ?? dispute.templateId,
      recipient: dispute.recipient,
      sentDate: ukDate(dispute.sentAt),
      status: dispute.status,
      deadlinePassed: Boolean(dispute.responseDeadline && dispute.responseDeadline.getTime() < Date.now()),
      notes: dispute.notes,
      findingMessages: report.alerts.map((a: { message: string }) => a.message),
      identityCheckMessage: identityCheck.overallMatch === false ? identityCheck.message : null,
      letterParts: parts,
      schedule,
      milestones,
      authority,
    });
    escalationPdf = await pdfDocToBuffer(escalationDoc);
  }

  const readme = [
    "Credit Report Analyzer — dispute pack",
    "",
    `Dispute: ${TEMPLATE_LABELS[dispute.templateId] ?? dispute.templateId} -> ${dispute.recipient}`,
    `Logged as sent: ${ukDate(dispute.sentAt)}`,
    "",
    "What's in this zip:",
    "- dispute-letter.pdf: the dispute letter as generated for this dispute.",
    ...(escalationPdf
      ? ["- escalation-pack.pdf: a case summary plus the ICO/FOS's contact details and dated milestones, for escalating a missed deadline."]
      : []),
    "- postage-tracking-sheet.pdf: a plain sheet to note how the letter was posted, plus its milestone dates.",
    "",
    "These are documents this app generated for you, from your own report and the details you entered — nothing in this pack has been sent anywhere on your behalf. Whether and how you post or email any of it is entirely up to you.",
  ].join("\n");

  const zipBuffer = await buildDisputePackZip({ letterPdf, escalationPdf, trackingSheetPdf, readme });

  logAudit(req.user!.id, "DOWNLOAD_PDF", { reportId: dispute.reportId, detail: "dispute pack (.zip)" });

  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="dispute-pack-${dispute.id}.zip"`);
  res.send(zipBuffer);
}

/**
 * Sends two kinds of reminder email in one batch run — a dispute past its
 * response deadline with no update logged, and a periodic "time to
 * re-check your credit file" nudge for users who opted into one. There is
 * no in-app scheduler: this route only runs when something outside the
 * app calls it, and does nothing on its own otherwise.
 *
 * Wiring a free external scheduler to this (pick one):
 *  - Render Cron Job: create one running once daily that does
 *    `curl -fsS -X POST https://<api-host>/api/disputes/run-reminders \
 *       -H "x-internal-secret: <INTERNAL_TASK_SECRET>"`.
 *  - GitHub Actions: a workflow with `on: schedule: - cron: "0 8 * * *"`
 *    whose job runs the same curl command, with the secret stored as a
 *    repository secret and passed via `${{ secrets.INTERNAL_TASK_SECRET }}`.
 *
 * Be honest with yourself about what "wired up" means here: without
 * `INTERNAL_TASK_SECRET` set in the backend's environment, this route
 * always responds 404 and reminders simply never fire — nothing about
 * this endpoint existing makes them happen automatically. An operator has
 * to both set that secret and point a scheduler at this URL with it.
 */
export async function runReminders(req: Request, res: Response) {
  // Undefined secret disables the feature outright, and does so as a
  // plain 404 rather than a 401/403 — an unconfigured deployment
  // shouldn't even reveal that an internal endpoint exists here.
  if (!env.internalTaskSecret) {
    throw new HttpError(404, "Not found");
  }
  if (req.header("x-internal-secret") !== env.internalTaskSecret) {
    throw new HttpError(401, "Unauthorized");
  }

  const now = new Date();

  const disputeCandidates = await prisma.disputeRecord.findMany({
    where: { status: "SENT", reminderSentAt: null, responseDeadline: { not: null } },
    select: { id: true, status: true, responseDeadline: true, reminderSentAt: true, userId: true, recipient: true },
  });
  const dueDisputeIds = new Set(selectDisputesNeedingReminder(disputeCandidates, now));

  let disputeRemindersSent = 0;
  for (const dispute of disputeCandidates) {
    if (!dueDisputeIds.has(dispute.id)) continue;
    // One failure (a bad address, a down mail server) must never stop the
    // rest of the batch from being processed.
    try {
      const user = await prisma.user.findUnique({ where: { id: dispute.userId }, select: { email: true } });
      if (!user) continue;
      await sendMail({
        to: user.email,
        subject: "Your dispute has passed its response deadline",
        text: `Your dispute to ${dispute.recipient} passed its response deadline with no update logged. If you haven't heard back, you can download an escalation pack from the report's dispute tracker.`,
      });
      await prisma.disputeRecord.update({ where: { id: dispute.id }, data: { reminderSentAt: now } });
      disputeRemindersSent += 1;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[runReminders] failed to send deadline reminder for dispute ${dispute.id}:`, err);
    }
  }

  const recheckCandidates = await prisma.user.findMany({
    where: { recheckReminderMonths: { not: null } },
    select: { id: true, email: true, recheckReminderMonths: true, lastRecheckReminderAt: true },
  });
  const dueRecheckIds = new Set(selectUsersNeedingRecheckReminder(recheckCandidates, now));

  let recheckRemindersSent = 0;
  for (const user of recheckCandidates) {
    if (!dueRecheckIds.has(user.id)) continue;
    try {
      await sendMail({
        to: user.email,
        subject: "Time to re-check your credit file",
        text: `It's been ${user.recheckReminderMonths} months since you set a reminder to re-check your credit file — uploading a fresh report will show what's changed.`,
      });
      await prisma.user.update({ where: { id: user.id }, data: { lastRecheckReminderAt: now } });
      recheckRemindersSent += 1;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[runReminders] failed to send recheck reminder for user ${user.id}:`, err);
    }
  }

  res.json({ disputeRemindersSent, recheckRemindersSent });
}
