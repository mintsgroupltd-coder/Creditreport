/**
 * Pure, DB-free selection logic for the two kinds of automated reminder
 * email this app can send (see disputes.controller.ts's `runReminders`,
 * which fetches candidates from Prisma and hands them to these functions).
 * Kept separate from any database or mail-sending code, matching this
 * codebase's other analytics modules (e.g. reconciliation.ts), so the
 * actual selection rules — which dispute or user is "due" — can be unit
 * tested directly without a database.
 */

export interface DisputeReminderCandidate {
  id: string;
  status: "SENT" | "RESOLVED" | "NO_RESPONSE";
  responseDeadline: Date | null;
  reminderSentAt: Date | null;
}

/**
 * A dispute needs a "deadline passed, no update logged" reminder when:
 *  - it's still open (`status === "SENT"`) — a dispute already marked
 *    RESOLVED or NO_RESPONSE has already been actioned by the user, so
 *    nudging them again would be noise, not help;
 *  - it actually has a deadline — advisory CCJ/lender letters have no
 *    fixed statutory response window and get `responseDeadline: null`
 *    (see DEADLINE_DAYS in disputes.controller.ts), so there's nothing
 *    for them to have "passed";
 *  - that deadline is at or before `now` — an exactly-equal deadline
 *    counts as passed rather than waiting for it to fall strictly in the
 *    past, since the deadline day itself is the day the response window
 *    has closed;
 *  - no reminder has gone out for it yet (`reminderSentAt === null`) —
 *    this is a one-shot nudge, not a repeating one, so a dispute that
 *    already got its reminder is never selected again even if this job
 *    runs daily forever.
 */
export function selectDisputesNeedingReminder(disputes: DisputeReminderCandidate[], now: Date): string[] {
  return disputes
    .filter(
      (d) =>
        d.status === "SENT" &&
        d.responseDeadline !== null &&
        d.responseDeadline.getTime() <= now.getTime() &&
        d.reminderSentAt === null
    )
    .map((d) => d.id);
}

export interface RecheckReminderCandidate {
  id: string;
  recheckReminderMonths: number | null;
  lastRecheckReminderAt: Date | null;
}

/**
 * Whole calendar months elapsed between `from` and `now` — e.g. 15 Jan to
 * 15 Apr is exactly 3 months, but 15 Jan to 14 Apr is only 2, because the
 * 15th hasn't come round again yet. This is the same "has a full period
 * actually elapsed" rule a monthly billing cycle uses, rather than a flat
 * 30-day approximation that drifts across months of different lengths.
 */
function fullMonthsElapsed(from: Date, now: Date): number {
  let months = (now.getFullYear() - from.getFullYear()) * 12 + (now.getMonth() - from.getMonth());
  if (now.getDate() < from.getDate()) months -= 1;
  return months;
}

/**
 * A user needs a "time to re-check your credit file" nudge when:
 *  - they've actually opted in — `recheckReminderMonths` is a positive
 *    number; null, zero or negative all mean "off", matching this
 *    field's own doc comment on the User model in schema.prisma;
 *  - and either they've never been reminded before (`lastRecheckReminderAt
 *    === null` — due immediately once they opt in, not after waiting a
 *    full cycle from whenever they happened to set the preference) or at
 *    least that many whole months have passed since the last reminder.
 */
export function selectUsersNeedingRecheckReminder(users: RecheckReminderCandidate[], now: Date): string[] {
  return users
    .filter((u) => {
      if (u.recheckReminderMonths === null || u.recheckReminderMonths <= 0) return false;
      if (u.lastRecheckReminderAt === null) return true;
      return fullMonthsElapsed(u.lastRecheckReminderAt, now) >= u.recheckReminderMonths;
    })
    .map((u) => u.id);
}
