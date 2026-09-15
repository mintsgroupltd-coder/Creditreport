import { Response } from "express";
import { prisma } from "../config/prisma";
import { AuthenticatedRequest } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";
import { parseReportCsv, parseReportText } from "../services/parsing";
import { parseCsv } from "../utils/csv";
import { extractPdfText } from "../utils/pdfText";
import { saveParsedReport } from "../services/reportPersistence";
import { generateDisputeText } from "../services/analytics/disputeTextGenerator";

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

export async function getReport(req: AuthenticatedRequest, res: Response) {
  const report = await loadOwnedReport(req.params.id, req.user!.id);

  const activeCount = report.accounts.filter((a: OwnedAccount) => a.status === "ACTIVE").length;
  const closedCount = report.accounts.filter(
    (a: OwnedAccount) => a.status === "SETTLED" || a.status === "SATISFIED" || a.status === "CLOSED"
  ).length;
  const defaultCount = report.accounts.filter((a: OwnedAccount) => a.status === "DEFAULT").length;

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
    stats: {
      totalAccounts: report.accounts.length,
      activeAccounts: activeCount,
      closedAccounts: closedCount,
      defaultAccounts: defaultCount,
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
    alerts: report.alerts,
  });
}

export async function getDisputeText(req: AuthenticatedRequest, res: Response) {
  const report = await loadOwnedReport(req.params.id, req.user!.id);

  // Re-hydrate just enough of ParsedReport shape for the generator —
  // it only reads applicantName/dateOfBirth/accounts[].recorded*/events.
  const parsedShape = {
    bureau: report.bureau,
    applicantName: report.applicantName ?? undefined,
    dateOfBirth: report.dateOfBirth ? report.dateOfBirth.toISOString().slice(0, 10) : undefined,
    addresses: [],
    accounts: [],
    events: report.events.map((e: OwnedEvent) => ({
      type: e.type,
      date: e.date.toISOString().slice(0, 10),
      amount: e.amount ? Number(e.amount) : undefined,
      detail: (e.detail as Record<string, unknown>) ?? {},
    })),
    warnings: [],
  };

  const text = generateDisputeText(parsedShape as Parameters<typeof generateDisputeText>[0]);
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.send(text);
}

export async function deleteReport(req: AuthenticatedRequest, res: Response) {
  const report = await prisma.report.findFirst({ where: { id: req.params.id, userId: req.user!.id } });
  if (!report) throw new HttpError(404, "Report not found");
  await prisma.report.delete({ where: { id: report.id } });
  res.status(204).send();
}
