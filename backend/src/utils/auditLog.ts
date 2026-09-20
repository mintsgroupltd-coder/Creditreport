import { prisma } from "../config/prisma";

/**
 * Best-effort record of something sensitive happening to an account or
 * report — viewed, downloaded, shared, emailed — surfaced back to the
 * user on the settings page so they have visibility into their own
 * account's activity. Deliberately swallows its own errors: an audit
 * log write must never be the reason a real user action (viewing a
 * report, sending a letter) fails.
 */
export function logAudit(userId: string, action: string, options?: { reportId?: string; detail?: string }): void {
  prisma.auditLogEntry
    .create({
      data: {
        userId,
        action,
        reportId: options?.reportId,
        detail: options?.detail,
      },
    })
    .catch(() => undefined);
}
