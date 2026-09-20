import { Response } from "express";
import { prisma } from "../config/prisma";
import { AuthenticatedRequest } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";
import { parseReportCsv, parseReportText } from "../services/parsing";
import { parseCsv } from "../utils/csv";
import { extractPdfText } from "../utils/pdfText";
import { saveParsedReport } from "../services/reportPersistence";
import {
  buildDisputeLetterParts,
  DisputeLetterInput,
  DisputeTemplateId,
  generateDisputeText,
  listDisputeTemplates,
} from "../services/analytics/disputeTextGenerator";
import { CreditScoreBureau, estimateCreditScore } from "../services/analytics/creditScoreEstimate";
import { checkProfileIdentityMatch } from "../services/analytics/identityCheck";
import { buildDocumentPins } from "../services/analytics/documentPins";
import { extractBureauRefs } from "../services/analytics/relatedRefs";
import { DisputeScheduleRow, EnvelopeSize, renderDisputeLetterPdf, SignatureMode } from "../services/pdf/disputeLetterPdf";

export async function uploadReport(req: AuthenticatedRequest, res: Response) {
  if (!req.file) throw new HttpError(400, "No file uploaded — expected a multipart field named 'file'");
  const userId = req.user!.id;

  const isCsv = req.file.mimetype === "text/csv" || req.file.originalname.toLowerCase().endsWith(".csv");
  const isPdf = req.file.mimetype === "application/pdf" || req.file.originalname.toLowerCase().endsWith(".pdf");
  if (!isCsv && !isPdf) throw new HttpError(400, "Only PDF and CSV files are supported");

  if (isPdf) {
    const rawText = await extractPdfText(req.file.buffer);
    const parsed = parseReportText(rawText);
    const { reportId, riskSummary } = await saveParsedReport({
      userId,
      sourceFileName: req.file.originalname,
      sourceFileType: "pdf",
      rawText,
      parsed,
    });
    return res.status(201).json({ reportId, bureau: parsed.bureau, warnings: parsed.warnings, riskSummary });
  }

  const rows = parseCsv(req.file.buffer);
  const parsed = parseReportCsv(rows);
  const { reportId, riskSummary } = await saveParsedReport({
    userId,
    sourceFileName: req.file.originalname,
    sourceFileType: "csv",
    rawText: JSON.stringify(rows),
    parsed,
  });
  return res.status(201).json({ reportId, bureau: parsed.bureau, warnings: parsed.warnings, riskSummary });
}

export async function listReports(req: AuthenticatedRequest, res: Response) {
  const reports = await prisma.report.findMany({
    where: { userId: req.user!.id },
    orderBy: { uploadedAt: "desc" },
    select: {
      id: true,
      bureau: true,
      sourceFileName: true,
      uploadedAt: true,
      applicantName: true,
      isSample: true,
      _count: { select: { accounts: true, alerts: true } },
    },
  });
  res.json({ reports });
}

export async function loadOwnedReport(reportId: string, userId: string) {
  const report = await prisma.report.findFirst({
    where: { id: reportId, userId },
    include: {
      accounts: { include: { lender: true } },
      events: true,
      alerts: true,
    },
  });
  if (!report) throw new HttpError(404, "Report not found");
  return report;
}

export type OwnedReport = Awaited<ReturnType<typeof loadOwnedReport>>;
type OwnedAccount = OwnedReport["accounts"][number];
type OwnedEvent = OwnedReport["events"][number];
type OwnedAlert = OwnedReport["alerts"][number];

const SEARCH_WINDOW_DAYS = 365;

/** Shared by getReport (full detail) and getReportComparison (progress
 * over time) so the two never drift on how a "negative marker" is
 * defined. */
export function computeStatsAndMarkers(report: OwnedReport) {
  const activeCount = report.accounts.filter((a: OwnedAccount) => a.status === "ACTIVE").length;
  const closedCount = report.accounts.filter(
    (a: OwnedAccount) => a.status === "SETTLED" || a.status === "SATISFIED" || a.status === "CLOSED"
  ).length;
  const defaultCount = report.accounts.filter((a: OwnedAccount) => a.status === "DEFAULT").length;

  const unsatisfiedCcjs = report.events.filter(
    (e: OwnedEvent) => e.type === "CCJ" && (e.detail as Record<string, unknown> | null)?.isSatisfied !== true
  );
  const activeDefaults = report.accounts.filter((a: OwnedAccount) => a.status === "DEFAULT");
  const searchCutoff = new Date();
  searchCutoff.setDate(searchCutoff.getDate() - SEARCH_WINDOW_DAYS);
  const recentSearches = report.events.filter((e: OwnedEvent) => e.type === "SEARCH" && e.date >= searchCutoff);

  return {
    stats: {
      totalAccounts: report.accounts.length,
      activeAccounts: activeCount,
      closedAccounts: closedCount,
      defaultAccounts: defaultCount,
    },
    negativeMarkers: {
      unsatisfiedCcjCount: unsatisfiedCcjs.length,
      ccjTotalAmount: unsatisfiedCcjs.reduce((sum: number, e: OwnedEvent) => sum + Number(e.amount ?? 0), 0),
      activeDefaultCount: activeDefaults.length,
      activeDefaultTotal: activeDefaults.reduce(
        (sum: number, a: OwnedAccount) => sum + Number(a.currentBalance ?? a.defaultBalance ?? 0),
        0
      ),
      highUtilisationCount: report.alerts.filter((a: OwnedAlert) => a.type === "HIGH_UTILISATION").length,
      recentSearchCount: recentSearches.length,
    },
  };
}

export async function getReport(req: AuthenticatedRequest, res: Response) {
  const report = await loadOwnedReport(req.params.id, req.user!.id);
  const { stats, negativeMarkers } = computeStatsAndMarkers(report);

  const accountIdByBureauRef = new Map<string, string>();
  for (const a of report.accounts as OwnedAccount[]) {
    if (a.bureauRef) accountIdByBureauRef.set(a.bureauRef, a.id);
  }

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

  res.json({
    report: {
      id: report.id,
      bureau: report.bureau,
      sourceFileName: report.sourceFileName,
      uploadedAt: report.uploadedAt,
      applicantName: report.applicantName,
      dateOfBirth: report.dateOfBirth,
      addresses: report.addresses,
      isSample: report.isSample,
    },
    identityCheck,
    insights: {
      riskLevel: report.riskLevel ?? "LOW",
      summary: report.summary ?? "No summary was generated for this report.",
      suggestedActions: (report.suggestedActions as string[] | null) ?? [],
    },
    stats,
    negativeMarkers,
    // Illustrative only — see creditScoreEstimate.ts's doc comment. Falls
    // back to Equifax's 0-1000 scale for an UNKNOWN-bureau report (e.g. a
    // generic CSV upload) since there's no bureau-specific scale to use.
    creditScoreEstimate: estimateCreditScore(report.bureau === "UNKNOWN" ? "EQUIFAX" : (report.bureau as CreditScoreBureau), {
      totalAccounts: stats.totalAccounts,
      activeDefaultCount: negativeMarkers.activeDefaultCount,
      unsatisfiedCcjCount: negativeMarkers.unsatisfiedCcjCount,
      highUtilisationAccountCount: negativeMarkers.highUtilisationCount,
      recentSearchCount: negativeMarkers.recentSearchCount,
    }),
    accounts: report.accounts.map((a: OwnedAccount) => ({
      id: a.id,
      bureauRef: a.bureauRef,
      lenderName: a.lender.name,
      accountType: a.accountType,
      status: a.status,
      currentBalance: a.currentBalance,
      creditLimit: a.creditLimit,
      defaultDate: a.defaultDate,
      defaultBalance: a.defaultBalance,
      satisfactionDate: a.satisfactionDate,
    })),
    events: report.events,
    alerts: report.alerts.map((a: OwnedAlert) => ({
      id: a.id,
      type: a.type,
      severity: a.severity,
      message: a.message,
      createdAt: a.createdAt,
      relatedAccountIds: Array.from(
        new Set(
          extractBureauRefs(a.relatedRefs)
            .map((ref) => accountIdByBureauRef.get(ref))
            .filter((id): id is string => Boolean(id))
        )
      ),
    })),
  });
}

/**
 * The "document inspector" data — the report's raw extracted text, plus
 * a best-effort set of "pins" tying each alert back to where its
 * evidence actually appears in that text (a bureau reference like "C11",
 * or failing that the lender's name). This is NOT a rendered image of
 * the original PDF page — the app only keeps the text pdf-parse
 * extracted at upload time, not the original file bytes — so a pin is a
 * position inside that extracted text, not a page/x/y coordinate. Any
 * alert whose anchor text can't be found gets returned with null
 * indexes rather than a guessed position, so the UI can be honest about
 * what it could and couldn't locate. See services/analytics/documentPins.ts.
 */
export async function getReportInspector(req: AuthenticatedRequest, res: Response) {
  const report = await loadOwnedReport(req.params.id, req.user!.id);
  const pins = buildDocumentPins(report.rawText, report.alerts as OwnedAlert[], report.accounts as OwnedAccount[]);

  res.json({
    reportId: report.id,
    sourceFileType: report.sourceFileType,
    rawText: report.rawText,
    pins,
  });
}

/** Compares this report against the user's most recent earlier report —
 * preferring one from the same bureau (so a like-for-like re-upload after
 * a dispute is the common case), falling back to any earlier report if
 * none from the same bureau exists. Used to show whether things are
 * actually improving after a dispute letter went out. */
export async function getReportComparison(req: AuthenticatedRequest, res: Response) {
  const report = await loadOwnedReport(req.params.id, req.user!.id);

  const previousSameBureau = await prisma.report.findFirst({
    where: { userId: req.user!.id, bureau: report.bureau, uploadedAt: { lt: report.uploadedAt }, id: { not: report.id } },
    orderBy: { uploadedAt: "desc" },
  });
  const previousAny =
    previousSameBureau ??
    (await prisma.report.findFirst({
      where: { userId: req.user!.id, uploadedAt: { lt: report.uploadedAt }, id: { not: report.id } },
      orderBy: { uploadedAt: "desc" },
    }));

  if (!previousAny) {
    return res.json({ hasPrevious: false });
  }

  const previous = await loadOwnedReport(previousAny.id, req.user!.id);
  const current = computeStatsAndMarkers(report);
  const before = computeStatsAndMarkers(previous);

  res.json({
    hasPrevious: true,
    previousReport: {
      id: previous.id,
      bureau: previous.bureau,
      uploadedAt: previous.uploadedAt,
      sourceFileName: previous.sourceFileName,
    },
    riskLevel: { previous: previous.riskLevel ?? "LOW", current: report.riskLevel ?? "LOW" },
    stats: { previous: before.stats, current: current.stats },
    negativeMarkers: { previous: before.negativeMarkers, current: current.negativeMarkers },
  });
}

/** Builds the generator's input straight from what's already persisted —
 * the saved Alert messages (which is where a DOB/name mismatch's wording
 * actually lives, since the raw "recorded name/DOB" fields it was
 * computed from aren't kept in the database) plus CCJ events and
 * in-default accounts, plus the user's own saved name/address (if any) so
 * the "[Your name]" / "[Your address]" placeholders can be filled in. Also
 * folds in a live profile-vs-report identity check (see
 * services/analytics/identityCheck.ts) — computed here rather than
 * persisted as an Alert, so it can never go stale if the user fills in
 * their profile after the report was already uploaded. */
export async function buildDisputeLetterInput(report: OwnedReport, userId: string, correctionStatement?: string): Promise<DisputeLetterInput> {
  const profile = await prisma.user.findUnique({
    where: { id: userId },
    select: { fullName: true, postalAddress: true, dateOfBirth: true, electoralRollRegistered: true, identityConfirmedAt: true },
  });

  const identityCheck = checkProfileIdentityMatch(
    { applicantName: report.applicantName, dateOfBirth: report.dateOfBirth ? report.dateOfBirth.toISOString().slice(0, 10) : null },
    {
      fullName: profile?.fullName ?? null,
      dateOfBirth: profile?.dateOfBirth ? profile.dateOfBirth.toISOString().slice(0, 10) : null,
      confirmed: Boolean(profile?.identityConfirmedAt),
    }
  );

  const identityAlertMessages = report.alerts
    .filter((a: OwnedAlert) => a.type === "DOB_MISMATCH" || a.type === "NAME_VARIATION" || a.type === "MIXED_FILE_RISK")
    .map((a: OwnedAlert) => a.message);
  if (identityCheck.overallMatch === false) identityAlertMessages.push(identityCheck.message);

  return {
    bureau: report.bureau,
    applicantName: report.applicantName,
    dateOfBirth: report.dateOfBirth ? report.dateOfBirth.toISOString().slice(0, 10) : undefined,
    identityAlertMessages,
    electoralRollRegistered: profile?.electoralRollRegistered ?? null,
    ccjs: report.events
      .filter((e: OwnedEvent) => e.type === "CCJ" && (e.detail as Record<string, unknown> | null)?.isSatisfied !== true)
      .map((e: OwnedEvent) => ({
        caseNumber: (e.detail as Record<string, unknown> | null)?.caseNumber as string | undefined,
        date: e.date.toISOString().slice(0, 10),
        amount: Number(e.amount ?? 0),
      })),
    activeDefaults: report.accounts
      .filter((a: OwnedAccount) => a.status === "DEFAULT")
      .map((a: OwnedAccount) => ({
        lenderName: a.lender.name,
        bureauRef: a.bureauRef,
        defaultDate: a.defaultDate ? a.defaultDate.toISOString().slice(0, 10) : undefined,
        balance: Number(a.currentBalance ?? a.defaultBalance ?? 0),
      })),
    senderName: profile?.fullName,
    senderAddress: profile?.postalAddress,
    correctionStatement: correctionStatement?.trim() || undefined,
  };
}

export async function getDisputeTemplates(req: AuthenticatedRequest, res: Response) {
  const report = await loadOwnedReport(req.params.id, req.user!.id);
  const input = await buildDisputeLetterInput(report, req.user!.id);
  res.json({ templates: listDisputeTemplates(input) });
}

export async function getDisputeText(req: AuthenticatedRequest, res: Response) {
  const report = await loadOwnedReport(req.params.id, req.user!.id);
  const templateId = (req.query.template as DisputeTemplateId | undefined) ?? "auto";
  const correctionStatement = typeof req.query.correctionStatement === "string" ? req.query.correctionStatement : undefined;

  const input = await buildDisputeLetterInput(report, req.user!.id, correctionStatement);
  const text = generateDisputeText(input, templateId);
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.send(text);
}

/** Builds the itemised-schedule rows straight from the same CCJ/default
 * data the letter itself was built from, so the PDF's appendix can never
 * drift from what the letter actually says. */
export function buildDisputeSchedule(input: DisputeLetterInput): DisputeScheduleRow[] {
  const rows: DisputeScheduleRow[] = [];
  for (const ccj of input.ccjs) {
    rows.push({
      label: `County Court Judgment${ccj.caseNumber ? ` — Case ${ccj.caseNumber}` : ""}`,
      detail: `Dated ${ccj.date}`,
      amount: ccj.amount,
    });
  }
  for (const d of input.activeDefaults) {
    rows.push({
      label: `${d.lenderName}${d.bureauRef ? ` (${d.bureauRef})` : ""}`,
      detail: `In default since ${d.defaultDate ?? "an unknown date"}`,
      amount: d.balance,
    });
  }
  return rows;
}

/**
 * Same letter as getDisputeText, rendered as a PDF. By default (no
 * `envelope` param) this is a simple formatted letter — margins + a
 * readable serif body font — ready to print and post without the user
 * needing to reformat plain text themselves. Passing `envelope=c5` or
 * `envelope=dl` instead produces a window-envelope-ready layout: the
 * recipient's address is positioned to show through the envelope's
 * window once folded, with dashed fold guides and (for DL) a visible
 * caveat that the window position is an approximation — see
 * services/pdf/disputeLetterPdf.ts for the underlying research notes.
 * `signature=blank` swaps the typed closing name for a blank line meant
 * for a wet-ink signature; the default, `signature=digital`, prints a
 * typed name explicitly labelled as a digital attestation, not a
 * signature or official seal.
 */
export async function getDisputePdf(req: AuthenticatedRequest, res: Response) {
  const report = await loadOwnedReport(req.params.id, req.user!.id);
  const templateId = (req.query.template as DisputeTemplateId | undefined) ?? "auto";
  const correctionStatement = typeof req.query.correctionStatement === "string" ? req.query.correctionStatement : undefined;
  const envelope: EnvelopeSize = req.query.envelope === "c5" || req.query.envelope === "dl" ? req.query.envelope : "none";
  const signatureMode: SignatureMode = req.query.signature === "blank" ? "blank" : "digital";

  const input = await buildDisputeLetterInput(report, req.user!.id, correctionStatement);
  const parts = buildDisputeLetterParts(input, templateId);
  const schedule = buildDisputeSchedule(input);

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="dispute-letter-${templateId}${envelope !== "none" ? `-${envelope}` : ""}.pdf"`);

  const doc = renderDisputeLetterPdf({ parts, envelope, signatureMode, schedule });
  doc.pipe(res);
  doc.end();
}

export async function deleteReport(req: AuthenticatedRequest, res: Response) {
  const report = await prisma.report.findFirst({ where: { id: req.params.id, userId: req.user!.id } });
  if (!report) throw new HttpError(404, "Report not found");
  await prisma.report.delete({ where: { id: report.id } });
  res.status(204).send();
}
