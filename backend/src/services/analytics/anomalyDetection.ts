import { ParsedAccount, ParsedReport } from "../parsing/types";
import { normalizeLenderName } from "../parsing/shared";
import { AlertFinding } from "./types";

/** "OLAOYE TAYO" -> Set{"OLAOYE","TAYO"} — order-insensitive so "TAYO OLAOYE" doesn't false-positive.
 * Exported so identityCheck.ts can compare a report's self-reported
 * applicant name against the user's own confirmed profile name using
 * the exact same matching rule, rather than a second, possibly
 * inconsistent implementation. */
export function nameTokens(name: string): Set<string> {
  return new Set(
    name
      .toUpperCase()
      .split(/[\s,]+/)
      .filter(Boolean)
  );
}

export function sameTokenSet(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const t of a) if (!b.has(t)) return false;
  return true;
}

interface RecordedIdentity {
  ref: string;
  name?: string;
  dob?: string;
}

function collectRecordedIdentities(report: ParsedReport): RecordedIdentity[] {
  const identities: RecordedIdentity[] = [];
  for (const a of report.accounts) {
    if (a.recordedName || a.recordedDob) {
      identities.push({ ref: a.bureauRef ?? a.lenderName, name: a.recordedName, dob: a.recordedDob });
    }
  }
  for (const e of report.events) {
    const name = (e.detail?.recordedName as string | undefined) ?? undefined;
    const dob = (e.detail?.recordedDob as string | undefined) ?? undefined;
    if (name || dob) identities.push({ ref: e.accountRef ?? e.type, name, dob });
  }
  return identities;
}

/**
 * Flags accounts/events recorded against a different DOB, or a
 * meaningfully different name, than the applicant's own details —
 * either a furnisher data-entry error or a sign the record has been
 * mismatched/merged with someone else's (a "mixed file").
 */
export function detectIdentityAnomalies(report: ParsedReport): AlertFinding[] {
  const alerts: AlertFinding[] = [];
  if (!report.applicantName && !report.dateOfBirth) return alerts;

  const identities = collectRecordedIdentities(report);
  const primaryTokens = report.applicantName ? nameTokens(report.applicantName) : null;

  const dobMismatches = identities.filter((i) => i.dob && report.dateOfBirth && i.dob !== report.dateOfBirth);
  const nameMismatches = identities.filter((i) => i.name && primaryTokens && !sameTokenSet(nameTokens(i.name), primaryTokens));

  if (dobMismatches.length > 0) {
    const refs = [...new Set(dobMismatches.map((m) => m.ref))];
    const dobs = [...new Set(dobMismatches.map((m) => m.dob))];
    alerts.push({
      type: "DOB_MISMATCH",
      severity: "CRITICAL",
      message: `${refs.length} record${refs.length > 1 ? "s" : ""} (${refs.join(", ")}) show a different date of birth (${dobs.join(", ")}) to the one on your application details (${report.dateOfBirth}). This can indicate a data-entry error, or that another person's record has been linked to yours.`,
      relatedRefs: { refs },
    });
  }

  if (nameMismatches.length > 0) {
    const refs = [...new Set(nameMismatches.map((m) => m.ref))];
    const names = [...new Set(nameMismatches.map((m) => m.name))];
    alerts.push({
      type: "NAME_VARIATION",
      severity: "WARNING",
      message: `${refs.length} record${refs.length > 1 ? "s" : ""} (${refs.join(", ")}) use a different name (${names.join(", ")}) to your application details (${report.applicantName}).`,
      relatedRefs: { refs },
    });
  }

  // Stacking both signals — different names AND different DOBs each
  // showing up — is a stronger "mixed file" signal than either alone.
  const distinctDobs = new Set([report.dateOfBirth, ...identities.map((i) => i.dob)].filter(Boolean));
  const distinctAddresses = new Set(report.accounts.map((a) => a.linkedAddress).filter(Boolean));
  if (dobMismatches.length > 0 && nameMismatches.length > 0 && distinctDobs.size > 1) {
    alerts.push({
      type: "MIXED_FILE_RISK",
      severity: "CRITICAL",
      message: `Multiple different names AND multiple different dates of birth appear across ${distinctAddresses.size || "several"} linked address(es) on this report. Worth ruling out a "mixed file" — where another person's data has been merged with yours — with the bureau directly.`,
    });
  }

  return alerts;
}

function accountsAreLikelyDuplicates(a: ParsedAccount, b: ParsedAccount): boolean {
  if (normalizeLenderName(a.lenderName) !== normalizeLenderName(b.lenderName)) return false;
  if (a.accountType.toUpperCase() !== b.accountType.toUpperCase()) return false;
  if (a.openedDate && b.openedDate && a.openedDate !== b.openedDate) return false;
  const balA = a.currentBalance ?? a.defaultBalance;
  const balB = b.currentBalance ?? b.defaultBalance;
  if (balA !== undefined && balB !== undefined && Math.abs(balA - balB) > 1) return false;
  return true;
}

/**
 * Flags account pairs that share lender, account type, open date and
 * balance closely enough to plausibly be the same debt reported
 * twice (common after a debt is sold — the original creditor and the
 * debt purchaser can both still show a version of it).
 */
export function detectDuplicateAccounts(report: ParsedReport): AlertFinding[] {
  const alerts: AlertFinding[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < report.accounts.length; i++) {
    for (let j = i + 1; j < report.accounts.length; j++) {
      const a = report.accounts[i];
      const b = report.accounts[j];
      if (!accountsAreLikelyDuplicates(a, b)) continue;
      const key = [a.bureauRef ?? i, b.bureauRef ?? j].sort().join("-");
      if (seen.has(key)) continue;
      seen.add(key);
      alerts.push({
        type: "DUPLICATE_ACCOUNT",
        severity: "INFO",
        message: `${a.lenderName} (${a.bureauRef ?? "?"}) and (${b.bureauRef ?? "?"}) look like they could be the same account reported twice — same type, open date and balance.`,
        relatedRefs: { refs: [a.bureauRef, b.bureauRef] },
      });
    }
  }

  return alerts;
}
