import { BUREAU_CONTACTS, ContactEntry, COURT_CONTACT } from "../../data/contacts";

export type DisputeTemplateId = "auto" | "identity" | "ccj" | "default_validation" | "general_accuracy";

export interface DisputeTemplateOption {
  id: DisputeTemplateId;
  label: string;
  description: string;
  /** Whether this report actually has the kind of finding this template addresses. */
  relevant: boolean;
}

export interface DisputeCcjInput {
  caseNumber?: string;
  date: string;
  amount: number;
}

export interface DisputeDefaultInput {
  lenderName: string;
  bureauRef?: string | null;
  defaultDate?: string | null;
  balance: number;
}

/** Everything the letter generator needs, built by the caller from
 * already-persisted data (the report's saved Alert rows, Account rows,
 * and CCJ Events) — NOT re-derived by re-running the analytics engine on
 * a partially-rehydrated shape, since fields like an account's
 * originally-recorded name/DOB aren't kept in the database once the
 * alert has been generated from them. */
export interface DisputeLetterInput {
  bureau: "EXPERIAN" | "EQUIFAX" | "TRANSUNION" | "UNKNOWN";
  applicantName?: string | null;
  dateOfBirth?: string | null;
  identityAlertMessages: string[];
  ccjs: DisputeCcjInput[];
  activeDefaults: DisputeDefaultInput[];
}

export function listDisputeTemplates(input: DisputeLetterInput): DisputeTemplateOption[] {
  return [
    {
      id: "auto",
      label: "Auto (recommended)",
      description: "Covers whatever the analytics engine actually found on this report — identity issues and unresolved CCJs together, if both are present.",
      relevant: true,
    },
    {
      id: "identity",
      label: "Identity / DOB / name correction",
      description: "To the credit reference agency, requesting correction of a date-of-birth, name, or mixed-file mismatch under UK GDPR Article 16.",
      relevant: input.identityAlertMessages.length > 0,
    },
    {
      id: "ccj",
      label: "CCJ satisfaction request",
      description: "To the court, requesting the judgment be marked satisfied once paid (or asking what's outstanding if it's still open).",
      relevant: input.ccjs.length > 0,
    },
    {
      id: "default_validation",
      label: "Debt validation (active default)",
      description: "To the lender, asking them to prove the debt is valid and correctly calculated before you pay or dispute it further.",
      relevant: input.activeDefaults.length > 0,
    },
    {
      id: "general_accuracy",
      label: "General accuracy dispute",
      description: "A general-purpose letter to the credit reference agency questioning the accuracy of one or more entries, for anything not covered above.",
      relevant: true,
    },
  ];
}

function addressBlock(contact: ContactEntry): string[] {
  return [...contact.addressLines];
}

function letterHeader(recipientLines: string[]): string[] {
  const today = new Date().toLocaleDateString("en-GB");
  return ["[Your name]", "[Your address]", "", ...recipientLines, "", today, ""];
}

function subjectLine(input: DisputeLetterInput): string {
  return `Re: ${input.applicantName ?? "[Your name]"}${input.dateOfBirth ? `, date of birth ${input.dateOfBirth}` : ""}`;
}

function closing(): string[] {
  return ["", "Please confirm receipt of this letter and let me know your timescale for responding.", "", "Yours faithfully,", "", "[Your name]"];
}

function bureauContact(bureau: DisputeLetterInput["bureau"]): ContactEntry | undefined {
  return bureau !== "UNKNOWN" ? BUREAU_CONTACTS[bureau] : undefined;
}

function generateIdentityLetter(input: DisputeLetterInput): string {
  const contact = bureauContact(input.bureau);
  const lines: string[] = [
    ...letterHeader(contact ? addressBlock(contact) : ["[Credit reference agency address]"]),
    "Dear Sir or Madam,",
    "",
    `${subjectLine(input)} — request to correct personal data`,
    "",
    "I am writing to request correction of inaccurate personal data under Article 16 of the UK GDPR (right to rectification) and the Data Protection Act 2018.",
    "",
  ];
  const messages = input.identityAlertMessages.length > 0 ? input.identityAlertMessages : ["[Describe the mismatched name/date-of-birth entry and which account(s) it appears on.]"];
  for (const message of messages) {
    lines.push(message);
    lines.push("");
  }
  lines.push(
    "Please investigate how this discrepancy arose, contact the organisation(s) concerned to have my details corrected, or confirm in writing if these records do not in fact belong to me."
  );
  lines.push(...closing());
  return lines.join("\n");
}

function generateCcjLetter(input: DisputeLetterInput): string {
  const lines: string[] = [
    ...letterHeader(addressBlock(COURT_CONTACT)),
    "Dear Sir or Madam,",
    "",
    `${subjectLine(input)} — County Court Judgment`,
    "",
    "I am writing about the following County Court Judgment(s) recorded against me, which my credit report does not show as satisfied:",
    "",
  ];
  if (input.ccjs.length === 0) {
    lines.push("- [Case number, date, and amount — see your judgment paperwork or the report's CCJ entry.]");
  }
  for (const ccj of input.ccjs) {
    lines.push(`- Case ${ccj.caseNumber ?? "[case number — see your judgment paperwork]"}, dated ${ccj.date}, for £${ccj.amount.toLocaleString("en-GB")}.`);
  }
  lines.push("");
  lines.push(
    "If this has already been paid in full, please treat this as a request for confirmation and, if applicable, a Certificate of Satisfaction (form N443) so the credit reference agencies can update their records. If it has not been paid, please confirm the current balance outstanding and any accepted way to settle it."
  );
  if (COURT_CONTACT.note) lines.push(`Note: ${COURT_CONTACT.note}`);
  lines.push(...closing());
  return lines.join("\n");
}

function generateDefaultValidationLetter(input: DisputeLetterInput): string {
  const largest = [...input.activeDefaults].sort((a, b) => b.balance - a.balance)[0];
  const accountLine = largest
    ? `My credit report shows an account with you, ${largest.lenderName}${largest.bureauRef ? ` (reference ${largest.bureauRef})` : ""}, in default since ${largest.defaultDate ?? "[date]"} with a balance of £${largest.balance.toLocaleString("en-GB")}.`
    : "My credit report shows an account with you in default. [Add the account reference, default date, and balance from the report.]";
  const lines: string[] = [
    ...letterHeader(["[Lender's correspondence address — see \"Accounts\" in the app for a place to save this]"]),
    "Dear Sir or Madam,",
    "",
    `${subjectLine(input)} — request for debt validation`,
    "",
    accountLine,
    "",
    "Before I make any payment or agree any arrangement, please provide: the original agreement or a true copy of it; a full statement of the account showing how the current balance was calculated; and confirmation that you are the current legal owner of this debt (or, if it has been assigned/sold, the name and address of the current owner).",
    "",
    "I look forward to receiving this information. I am not disputing that I may owe money — I am asking you to substantiate this specific debt and balance before we go further.",
  ];
  lines.push(...closing());
  return lines.join("\n");
}

function generateGeneralAccuracyLetter(input: DisputeLetterInput): string {
  const contact = bureauContact(input.bureau);
  const lines: string[] = [
    ...letterHeader(contact ? addressBlock(contact) : ["[Credit reference agency address]"]),
    "Dear Sir or Madam,",
    "",
    `${subjectLine(input)} — request to investigate accuracy of report entries`,
    "",
    "I am writing to query the accuracy of one or more entries on my credit report. [Describe the specific entry/entries you are querying and why — e.g. an account you don't recognise, a balance that looks wrong, or a status that doesn't match your own records.]",
    "",
    "Please investigate and let me know the outcome, including contacting the relevant lender(s) if needed.",
  ];
  lines.push(...closing());
  return lines.join("\n");
}

/** The original combined letter — identity paragraph and/or CCJ
 * paragraph, whichever apply, addressed to the bureau. Kept as the
 * "auto" default so a report with nothing unusual still gets a sensible
 * general-purpose letter. */
function generateAutoLetter(input: DisputeLetterInput): string {
  const contact = bureauContact(input.bureau);
  const lines: string[] = [
    ...letterHeader(contact ? addressBlock(contact) : ["[Credit reference agency address]"]),
    "Dear Sir or Madam,",
    "",
    `${subjectLine(input)} — request to correct/dispute information on my credit report`,
    "",
  ];

  if (input.identityAlertMessages.length > 0) {
    lines.push(
      "I am writing to request correction of inaccurate personal data under Article 16 of the UK GDPR (right to rectification) and the Data Protection Act 2018."
    );
    for (const message of input.identityAlertMessages) lines.push(message);
    lines.push(
      "Please investigate how this discrepancy arose, contact the organisation(s) concerned to have my name and date of birth corrected, or confirm in writing if these records do not in fact belong to me."
    );
    lines.push("");
  }

  if (input.ccjs.length > 0) {
    lines.push(
      `My report shows ${input.ccjs.length} County Court Judgment${input.ccjs.length > 1 ? "s" : ""} not marked as satisfied. If any of these has in fact been paid, please treat this letter as a request to update the record accordingly once I provide a Certificate of Satisfaction, or advise what further evidence is required.`
    );
    lines.push("");
  }

  if (input.identityAlertMessages.length === 0 && input.ccjs.length === 0) {
    lines.push("I am writing to query the accuracy of one or more entries on my credit report. [Describe the specific entry you are querying.]");
    lines.push("");
  }

  lines.push(...closing());
  return lines.join("\n");
}

/**
 * Builds a ready-to-send dispute/query letter body. `templateId` picks
 * which situation the letter addresses; "auto" (the default) covers
 * whatever was actually found on the report. The caller still needs to
 * fill in the person's own contact details and anything in [square
 * brackets] — we deliberately don't fabricate those.
 */
export function generateDisputeText(input: DisputeLetterInput, templateId: DisputeTemplateId = "auto"): string {
  switch (templateId) {
    case "identity":
      return generateIdentityLetter(input);
    case "ccj":
      return generateCcjLetter(input);
    case "default_validation":
      return generateDefaultValidationLetter(input);
    case "general_accuracy":
      return generateGeneralAccuracyLetter(input);
    case "auto":
    default:
      return generateAutoLetter(input);
  }
}
