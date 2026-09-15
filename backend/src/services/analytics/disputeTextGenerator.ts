import { ParsedReport } from "../parsing/types";
import { findUnsatisfiedCcjs } from "./negativeMarkers";
import { detectIdentityAnomalies } from "./anomalyDetection";

/**
 * Builds a ready-to-send dispute letter body from whatever the
 * analytics engine actually found — no fixed template with blanks;
 * the paragraphs it includes depend on what's wrong with this report.
 * The caller still needs to fill in the person's contact details,
 * which we deliberately don't fabricate.
 */
export function generateDisputeText(report: ParsedReport): string {
  const lines: string[] = [];
  const today = new Date().toLocaleDateString("en-GB");

  lines.push("[Your name]");
  lines.push("[Your address]");
  lines.push(today);
  lines.push("");
  lines.push("Dear Sir or Madam,");
  lines.push("");
  lines.push(
    `Re: Request to correct/dispute information on my credit report${report.applicantName ? ` — ${report.applicantName}` : ""}${report.dateOfBirth ? `, date of birth ${report.dateOfBirth}` : ""}`
  );
  lines.push("");

  const identityAlerts = detectIdentityAnomalies(report);
  const dobAlert = identityAlerts.find((a) => a.type === "DOB_MISMATCH");
  if (dobAlert) {
    lines.push(
      "I am writing to request correction of inaccurate personal data under Article 16 of the UK GDPR (right to rectification) and the Data Protection Act 2018."
    );
    lines.push(dobAlert.message);
    lines.push(
      "Please investigate how this discrepancy arose, contact the organisation(s) concerned to have my name and date of birth corrected, or confirm in writing if these records do not in fact belong to me."
    );
    lines.push("");
  }

  const ccjs = findUnsatisfiedCcjs(report);
  if (ccjs.length > 0) {
    lines.push(
      `My report shows ${ccjs.length} County Court Judgment${ccjs.length > 1 ? "s" : ""} not marked as satisfied. If any of these has in fact been paid, please treat this letter as a request to update the record accordingly once I provide a Certificate of Satisfaction, or advise what further evidence is required.`
    );
    lines.push("");
  }

  lines.push(
    "Please confirm receipt of this letter and let me know your timescale for investigating and responding. I look forward to your reply."
  );
  lines.push("");
  lines.push("Yours faithfully,");
  lines.push("");
  lines.push("[Your name]");

  return lines.join("\n");
}
