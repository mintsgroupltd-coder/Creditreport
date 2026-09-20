import { describe, expect, it } from "vitest";
import {
  DisputeReminderCandidate,
  RecheckReminderCandidate,
  selectDisputesNeedingReminder,
  selectUsersNeedingRecheckReminder,
} from "./disputeReminders";

const NOW = new Date("2026-06-15T12:00:00Z");

function dispute(overrides: Partial<DisputeReminderCandidate> = {}): DisputeReminderCandidate {
  return {
    id: "d1",
    status: "SENT",
    responseDeadline: new Date("2026-06-01T00:00:00Z"),
    reminderSentAt: null,
    ...overrides,
  };
}

describe("selectDisputesNeedingReminder", () => {
  it("selects a SENT dispute whose deadline has passed and hasn't been reminded yet", () => {
    const ids = selectDisputesNeedingReminder([dispute()], NOW);
    expect(ids).toEqual(["d1"]);
  });

  it("excludes a dispute with no deadline at all (advisory templates)", () => {
    const ids = selectDisputesNeedingReminder([dispute({ responseDeadline: null })], NOW);
    expect(ids).toEqual([]);
  });

  it("excludes a dispute that's already had its reminder sent", () => {
    const ids = selectDisputesNeedingReminder([dispute({ reminderSentAt: new Date("2026-06-02T00:00:00Z") })], NOW);
    expect(ids).toEqual([]);
  });

  it("excludes a RESOLVED dispute even with a passed deadline and no reminder sent", () => {
    const ids = selectDisputesNeedingReminder([dispute({ status: "RESOLVED" })], NOW);
    expect(ids).toEqual([]);
  });

  it("excludes a NO_RESPONSE dispute — already marked, not eligible for the automated nudge", () => {
    const ids = selectDisputesNeedingReminder([dispute({ status: "NO_RESPONSE" })], NOW);
    expect(ids).toEqual([]);
  });

  it("excludes a dispute whose deadline is still in the future", () => {
    const ids = selectDisputesNeedingReminder([dispute({ responseDeadline: new Date("2026-06-20T00:00:00Z") })], NOW);
    expect(ids).toEqual([]);
  });

  it("includes a dispute whose deadline is exactly now (boundary, not strictly past)", () => {
    const ids = selectDisputesNeedingReminder([dispute({ responseDeadline: new Date(NOW.getTime()) })], NOW);
    expect(ids).toEqual(["d1"]);
  });

  it("processes a mixed batch, returning only the ids that are due", () => {
    const ids = selectDisputesNeedingReminder(
      [
        dispute({ id: "due" }),
        dispute({ id: "already-reminded", reminderSentAt: new Date("2026-06-02T00:00:00Z") }),
        dispute({ id: "no-deadline", responseDeadline: null }),
        dispute({ id: "resolved", status: "RESOLVED" }),
        dispute({ id: "future", responseDeadline: new Date("2026-07-01T00:00:00Z") }),
      ],
      NOW
    );
    expect(ids.sort()).toEqual(["due"]);
  });
});

function user(overrides: Partial<RecheckReminderCandidate> = {}): RecheckReminderCandidate {
  return {
    id: "u1",
    recheckReminderMonths: 6,
    lastRecheckReminderAt: new Date("2025-12-15T00:00:00Z"),
    ...overrides,
  };
}

describe("selectUsersNeedingRecheckReminder", () => {
  it("excludes a user who never opted in (null)", () => {
    expect(selectUsersNeedingRecheckReminder([user({ recheckReminderMonths: null })], NOW)).toEqual([]);
  });

  it("excludes a user with the reminder explicitly turned off (0)", () => {
    expect(selectUsersNeedingRecheckReminder([user({ recheckReminderMonths: 0 })], NOW)).toEqual([]);
  });

  it("excludes a user with a nonsensical negative interval", () => {
    expect(selectUsersNeedingRecheckReminder([user({ recheckReminderMonths: -3 })], NOW)).toEqual([]);
  });

  it("includes a user who opted in and has never been reminded before, even if it's immediate", () => {
    expect(selectUsersNeedingRecheckReminder([user({ lastRecheckReminderAt: null })], NOW)).toEqual(["u1"]);
  });

  it("includes a user once exactly their configured number of whole months has elapsed", () => {
    // 2025-12-15 -> 2026-06-15 is exactly 6 whole months.
    expect(selectUsersNeedingRecheckReminder([user({ recheckReminderMonths: 6, lastRecheckReminderAt: new Date("2025-12-15T00:00:00Z") })], NOW)).toEqual(["u1"]);
  });

  it("excludes a user one day short of their configured interval (month-boundary math)", () => {
    // 2025-12-16 -> 2026-06-15 is only 5 full months (the 15th hasn't recurred since the 16th).
    expect(selectUsersNeedingRecheckReminder([user({ recheckReminderMonths: 6, lastRecheckReminderAt: new Date("2025-12-16T00:00:00Z") })], NOW)).toEqual([]);
  });

  it("includes a user whose interval has been exceeded, not just reached", () => {
    expect(selectUsersNeedingRecheckReminder([user({ recheckReminderMonths: 3, lastRecheckReminderAt: new Date("2025-01-01T00:00:00Z") })], NOW)).toEqual(["u1"]);
  });

  it("is lenient about a month-end start date (Jan 31 -> Mar 1 counts as one full month, not zero)", () => {
    // getDate() comparison only checks the day-of-month reached, so a
    // start date that fell on the 31st (a day March itself has, even
    // though February doesn't) is treated as "recurred" once the month
    // has advanced twice and any day has been reached — a deliberate
    // leniency rather than waiting for an exact day that a shorter month
    // in between may never contain.
    const marchFirst = new Date("2026-03-01T00:00:00Z");
    expect(selectUsersNeedingRecheckReminder([user({ recheckReminderMonths: 1, lastRecheckReminderAt: new Date("2026-01-31T00:00:00Z") })], marchFirst)).toEqual(["u1"]);
  });

  it("processes a mixed batch, returning only the ids that are due", () => {
    const ids = selectUsersNeedingRecheckReminder(
      [
        user({ id: "due", recheckReminderMonths: 6, lastRecheckReminderAt: new Date("2025-12-15T00:00:00Z") }),
        user({ id: "not-due", recheckReminderMonths: 12, lastRecheckReminderAt: new Date("2025-12-15T00:00:00Z") }),
        user({ id: "opted-out", recheckReminderMonths: null }),
        user({ id: "never-reminded", lastRecheckReminderAt: null }),
      ],
      NOW
    );
    expect(ids.sort()).toEqual(["due", "never-reminded"]);
  });
});
