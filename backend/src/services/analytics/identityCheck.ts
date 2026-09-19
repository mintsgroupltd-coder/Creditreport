import { nameTokens, sameTokenSet } from "./anomalyDetection";

/**
 * The user's own confirmed identity, as saved via GET/PATCH
 * /api/profile — "confirmed" means the account holder has stated it
 * themselves (all three of name/DOB/address are filled in), NOT that
 * it's been independently checked against any official register. This
 * app has no access to one, and every place this is surfaced says so.
 */
export interface ConfirmedProfile {
  fullName: string | null;
  dateOfBirth: string | null; // ISO yyyy-mm-dd
  confirmed: boolean;
}

export interface ProfileIdentityCheck {
  /** Whether the user has a confirmed profile to check against at all. */
  profileConfirmed: boolean;
  /** null when there's nothing to compare (report and/or profile is missing that field). */
  nameMatches: boolean | null;
  dobMatches: boolean | null;
  /** True only when at least one field was actually compared and none disagreed. */
  overallMatch: boolean | null;
  message: string;
}

/**
 * Compares a report's own self-reported "Application Details" (name,
 * DOB) against the user's separately confirmed profile identity. This
 * catches something the internal mixed-file check can't: a report
 * whose own applicant block doesn't match the person who actually
 * uploaded it — for example if the wrong file was uploaded, or a
 * bureau's own records have the applicant's top-level details wrong,
 * not just one account within it.
 */
export function checkProfileIdentityMatch(
  report: { applicantName: string | null; dateOfBirth: string | null },
  profile: ConfirmedProfile
): ProfileIdentityCheck {
  if (!profile.confirmed) {
    return {
      profileConfirmed: false,
      nameMatches: null,
      dobMatches: null,
      overallMatch: null,
      message:
        "Add and confirm your name, date of birth and address in Settings to check this report's own application details against what you say is true — not just for internal consistency.",
    };
  }

  const nameMatches =
    profile.fullName && report.applicantName ? sameTokenSet(nameTokens(profile.fullName), nameTokens(report.applicantName)) : null;
  const dobMatches = profile.dateOfBirth && report.dateOfBirth ? profile.dateOfBirth === report.dateOfBirth : null;

  if (nameMatches === false || dobMatches === false) {
    const parts: string[] = [];
    if (nameMatches === false) parts.push(`the name on this report ("${report.applicantName}") doesn't match your confirmed name ("${profile.fullName}")`);
    if (dobMatches === false) parts.push(`the date of birth on this report (${report.dateOfBirth}) doesn't match your confirmed date of birth (${profile.dateOfBirth})`);
    return {
      profileConfirmed: true,
      nameMatches,
      dobMatches,
      overallMatch: false,
      message: `This report's own application details don't match your confirmed profile — ${parts.join(
        " and "
      )}. Worth double-checking this is actually your report before relying on it, and it's useful evidence if you end up raising a mixed-file concern with the bureau.`,
    };
  }

  if (nameMatches === true || dobMatches === true) {
    return {
      profileConfirmed: true,
      nameMatches,
      dobMatches,
      overallMatch: true,
      message: "This report's own application details match your confirmed profile.",
    };
  }

  return {
    profileConfirmed: true,
    nameMatches,
    dobMatches,
    overallMatch: null,
    message: "This report doesn't show enough of its own application details to compare against your confirmed profile.",
  };
}
