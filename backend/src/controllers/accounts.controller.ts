import { Response } from "express";
import { prisma } from "../config/prisma";
import { AuthenticatedRequest } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";

export async function getAccountDetail(req: AuthenticatedRequest, res: Response) {
  const account = await prisma.account.findFirst({
    where: { id: req.params.id, report: { userId: req.user!.id } },
    include: {
      lender: true,
      statusHistory: { orderBy: { periodDate: "asc" } },
      events: { orderBy: { date: "asc" } },
    },
  });
  if (!account) throw new HttpError(404, "Account not found");

  // A single timeline the UI can render directly: monthly balance/status
  // points plus any dated events (the default itself, searches tied to
  // this account) merged and sorted.
  const timeline = [
    ...account.statusHistory.map((h: (typeof account.statusHistory)[number]) => ({
      kind: "STATUS" as const,
      date: h.periodDate,
      statusCode: h.statusCode,
      balance: h.balance,
    })),
    ...account.events.map((e: (typeof account.events)[number]) => ({
      kind: "EVENT" as const,
      date: e.date,
      type: e.type,
      amount: e.amount,
      detail: e.detail,
    })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime());

  res.json({
    account: {
      id: account.id,
      bureauRef: account.bureauRef,
      lenderName: account.lender.name,
      accountType: account.accountType,
      status: account.status,
      openedDate: account.openedDate,
      currentBalance: account.currentBalance,
      creditLimit: account.creditLimit,
      defaultDate: account.defaultDate,
      defaultBalance: account.defaultBalance,
      satisfactionDate: account.satisfactionDate,
      linkedAddress: account.linkedAddress,
    },
    timeline,
  });
}
