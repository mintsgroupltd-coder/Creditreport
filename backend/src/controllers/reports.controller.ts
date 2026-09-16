import { Response } from "express";
import { prisma } from "../config/prisma";
import { AuthenticatedRequest } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";
import { parseReportCsv, parseReportText } from "../services/parsing";
import { parseCsv } from "../utils/csv";
import { extractPdfText } from "../utils/pdfText";
import { saveParsedReport } from "../services/reportPersistence";
import { DisputeLetterInput, DisputeTemplateId, generateDisputeText, listDisputeTemplates } from "../services/analytics/disputeTextGenerator";

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
      _count: { select: { accounts: true, alerts: true } },
    },
  });
  res.json({ reports });
}

async function loadOwnedReport(reportId: string, userId: string) {
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

type OwnedReport = Awaited<ReturnType<typeof loadOwnedReport>>;
type OwnedAccount = OwnedReport["accounts"][number];
type OwnedEvent = OwnedReport["events"][number];
type OwnedAlert = OwnedReport["alerts"][number];

const SEARCH_WINDOW_DAYS = 365;

/** relatedRefs is a loosely-shaped bag written by different analytics checks
 * ({accountRef}, {eventRef}, {refs: [...]}) — all of them hold bureau
 * reference strings (e.g. "C11"), never DB ids, so the frontend can't link
 * to an account from them directly. This pulls out every string value,
 * regardless of which key it was filed under. */
function extractBureauRefs(relatedRefs: unknown): string[] {
  if (!relatedRefs || typeof relatedRefs !== "object") return [];
  const values = Object.values(relatedRefs as Record<string, unknown>);
  const refs: string[] = [];
  for (const v of values) {
    if (typeof v === "string") refs.push(v);
    else if (Array.isArray(v)) refs.push(...v.filter((x): x is string => typeof x === "string"));
  }
  return refs;
}

export async function getReport(req: AuthenticatedRequest, res: Response) {
  const report = await loadOwnedReport(req.params.id, req.user!.id);

  const activeCount = report.accounts.filter((a: OwnedAccount) => a.status === "ACTIVE").length;
  const closedCount = report.accounts.filter(
    (a: OwnedAccount) => a.status === "SETTLED" || a.status === "SATISFIED" || a.status === "CLOSED"
  ).length;
  const defaultCount = report.accounts.filter((a: OwnedAccount) => a.status === "DEFAULT").length;

  const accountIdByBureauRef = new Map<string, string>();
  for (const a of report.accounts as OwnedAccount[]) {
    if (a.bureauRef) accountIdByBureauRef.set(a.bureauRef, a.id);
  }

  const unsatisfiedCcjs = report.events.filter(
    (e: OwnedEvent) => e.type === "CCJ" && (e.detail as Record<string, unknown> | null)?.isSatisfied !== true
  );
  const activeDefaults = report.accounts.filter((a: OwnedAccount) => a.status === "DEFAULT");
  const searchCutoff = new Date();
  searchCutoff.setDate(searchCutoff.getDate() - SEARCH_WINDOW_DAYS);
  const recentSearches = report.events.filter((e: OwnedEvent) => e.type === "SEARCH" && e.date >= searchCutoff);

  res.json({
    report: {
      id: report.id,
      bureau: report.bureau,
      sourceFileName: report.sourceFileName,
      uploadedAt: report.uploadedAt,
      applicantName: report.applicantName,
      dateOfBirth: report.dateOfBirth,
      addresses: report.addresses,
    },
    insights: {
      riskLevel: report.riskLevel ?? "LOW",
      summary: report.summary ?? "No summary was generated for this report.",
      suggestedActions: (report.suggestedActions as string[] | null) ?? [],
    },
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

/** Builds the generator's input straight from what's already persisted —
 * the saved Alert messages (which is where a DOB/name mismatch's wording
 * actually lives, since the raw "recorded name/DOB" fields it was
 * computed from aren't kept in the database) plus CCJ events and
 * in-default accounts. */
function buildDisputeLetterInput(report: OwnedReport): DisputeLetterInput {
  return {
    bureau: report.bureau,
    applicantName: report.applicantName,
    dateOfBirth: report.dateOfBirth ? report.dateOfBirth.toISOString().slice(0, 10) : undefined,
    identityAlertMessages: report.alerts
      .filter((a: OwnedAlert) => a.type === "DOB_MISMATCH" || a.type === "NAME_VARIATION" || a.type === "MIXED_FILE_RISK")
      .map((a: OwnedAlert) => a.message),
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
  };
}

export async function getDisputeTemplates(req: AuthenticatedRequest, res: Response) {
  const report = await loadOwnedReport(req.params.id, req.user!.id);
  res.json({ templates: listDisputeTemplates(buildDisputeLetterInput(report)) });
}

export async function getDisputeText(req: AuthenticatedRequest, res: Response) {
  const report = await loadOwnedReport(req.params.id, req.user!.id);
  const templateId = (req.query.template as DisputeTemplateId | undefined) ?? "auto";

  const text = generateDisputeText(buildDisputeLetterInput(report), templateId);
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.send(text);
}

export async function deleteReport(req: AuthenticatedRequest, res: Response) {
  const report = await prisma.report.findFirst({ where: { id: req.params.id, userId: req.user!.id } });
  if (!report) throw new HttpError(404, "Report not found");
  await prisma.report.delete({ where: { id: report.id } });
  res.status(204).send();
}
