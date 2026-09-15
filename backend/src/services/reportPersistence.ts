import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { ParsedReport } from "./parsing/types";
import { normalizeLenderName } from "./parsing/shared";
import { buildRiskSummary } from "./analytics/riskSummary";

interface SaveReportInput {
  userId: string;
  sourceFileName: string;
  sourceFileType: "pdf" | "csv";
  rawText: string;
  parsed: ParsedReport;
}

/**
 * Persists a ParsedReport: creates the Report row, upserts Lenders by
 * normalized name (so "JC International Acquisition LLC" collapses to
 * one Lender row across accounts), creates Accounts + their monthly
 * AccountStatusEntry rows, Events, and — by re-running the analytics
 * engine against the just-parsed data — Alerts. Everything happens in
 * one transaction so a partially-saved report is never visible.
 */
export async function saveParsedReport({ userId, sourceFileName, sourceFileType, rawText, parsed }: SaveReportInput) {
  const riskSummary = buildRiskSummary(parsed);

  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const report = await tx.report.create({
      data: {
        userId,
        bureau: parsed.bureau,
        sourceFileName,
        sourceFileType,
        rawText,
        applicantName: parsed.applicantName,
        dateOfBirth: parsed.dateOfBirth ? new Date(parsed.dateOfBirth) : undefined,
        addresses: parsed.addresses as unknown as Prisma.InputJsonValue,
      },
    });

    const accountIdByRef = new Map<string, string>();

    for (const account of parsed.accounts) {
      const normalized = normalizeLenderName(account.lenderName) || account.lenderName.toUpperCase();
      const lender = await tx.lender.upsert({
        where: { normalizedName: normalized },
        update: {},
        create: { name: account.lenderName, normalizedName: normalized },
      });

      const created = await tx.account.create({
        data: {
          reportId: report.id,
          lenderId: lender.id,
          bureauRef: account.bureauRef,
          accountType: account.accountType,
          status: account.status,
          openedDate: account.openedDate ? new Date(account.openedDate) : undefined,
          currentBalance: account.currentBalance,
          creditLimit: account.creditLimit,
          defaultDate: account.defaultDate ? new Date(account.defaultDate) : undefined,
          defaultBalance: account.defaultBalance,
          satisfactionDate: account.satisfactionDate ? new Date(account.satisfactionDate) : undefined,
          linkedAddress: account.linkedAddress,
        },
      });

      if (account.bureauRef) accountIdByRef.set(account.bureauRef, created.id);

      if (account.statusHistory.length > 0) {
        await tx.accountStatusEntry.createMany({
          data: account.statusHistory.map((h) => ({
            accountId: created.id,
            periodDate: new Date(h.periodDate),
            statusCode: h.statusCode,
            balance: h.balance,
          })),
        });
      }
    }

    if (parsed.events.length > 0) {
      await tx.event.createMany({
        data: parsed.events.map((e) => ({
          reportId: report.id,
          accountId: e.accountRef ? accountIdByRef.get(e.accountRef) : undefined,
          type: e.type,
          date: new Date(e.date),
          amount: e.amount,
          detail: (e.detail ?? {}) as Prisma.InputJsonValue,
        })),
      });
    }

    if (riskSummary.alerts.length > 0) {
      await tx.alert.createMany({
        data: riskSummary.alerts.map((a) => ({
          reportId: report.id,
          type: a.type,
          severity: a.severity,
          message: a.message,
          relatedRefs: (a.relatedRefs ?? {}) as Prisma.InputJsonValue,
        })),
      });
    }

    return { reportId: report.id, riskSummary };
  });
}
