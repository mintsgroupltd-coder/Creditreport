import { BUREAU_CONTACTS, ContactEntry, COURT_CONTACT, ICO_CONTACT } from "../../data/contacts";

export type DisputeTemplateId = "auto" | "identity" | "ccj" | "default_validation" | "general_accuracy" | "notice_of_correction";

/** The word limit Parliament actually set for a s.159(3) notice of
 * correction — not a stylistic choice, so it's exported for the frontend's
 * live counter to match exactly. */
export const NOTICE_OF_CORRECTION_WORD_LIMIT = 200;

export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;
}

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
  /** From the user's saved profile, if they've filled it in — used to
   * replace the "[Your name]" / "[Your address]" placeholders so the
   * letter is ready to send as-is. Left blank, the placeholders stay. */
  senderName?: string | null;
  senderAddress?: string | null;
  /** The user's own up-to-200-word statement for a section 159(3) notice
   * of correction — drafted BY the user, never generated for them, since
   * the Act requires the notice to be "drawn up by the objector". Only
   * used by the "notice_of_correction" template. */
  correctionStatement?: string | null;
  /** Self-declared by the user in Settings — never independently
   * checked against the actual electoral roll (no API for that exists
   * here). Only ever used to ADD a supporting line when explicitly
   * true; `false` or `null` adds nothing, since a letter shouldn't
   * volunteer information that weakens the user's own case. */
  electoralRollRegistered?: boolean | null;
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
    {
      id: "notice_of_correction",
      label: "Formal statutory notice of correction (s.159)",
      description:
        "A formal statutory notice under section 159(3) of the Consumer Credit Act 1974, requiring the credit reference agency to add your own up-to-200-word correction statement to an entry — normally used after they've declined to remove or amend it outright.",
      relevant: input.identityAlertMessages.length > 0,
    },
  ];
}

/** One generator's output before it's assembled into a full letter — kept
 * structured (rather than one flattened string) so the envelope-mode PDF
 * renderer can place the recipient address precisely inside a window
 * cut-out instead of just dumping text top-to-bottom. */
interface LetterBody {
  recipientLines: string[];
  /** Everything from "Dear Sir or Madam," to the signature, inclusive. */
  bodyLines: string[];
}

function addressBlock(contact: ContactEntry): string[] {
  return [...contact.addressLines];
}

function senderLines(input: DisputeLetterInput): string[] {
  const name = input.senderName?.trim() || "[Your name]";
  const address = input.senderAddress?.trim();
  return address ? [name, ...address.split("\n").map((l) => l.trim())] : [name, "[Your address]"];
}

function todayLine(): string {
  return new Date().toLocaleDateString("en-GB");
}

function subjectLine(input: DisputeLetterInput): string {
  return `Re: ${input.applicantName ?? input.senderName ?? "[Your name]"}${input.dateOfBirth ? `, date of birth ${input.dateOfBirth}` : ""}`;
}

function closing(input: DisputeLetterInput): string[] {
  return [
    "",
    "Please confirm receipt of this letter and let me know your timescale for responding.",
    "",
    "Yours faithfully,",
    "",
    input.senderName?.trim() || "[Your name]",
  ];
}

function bureauContact(bureau: DisputeLetterInput["bureau"]): ContactEntry | undefined {
  return bureau !== "UNKNOWN" ? BUREAU_CONTACTS[bureau] : undefined;
}

/** A supporting sentence for the identity-type letters, added only when
 * the user has explicitly said (in Settings) that they're on the
 * electoral roll at their current address — CRAs commonly weigh
 * electoral roll registration when resolving an identity/address
 * dispute. Self-declared, so the letter is honest about that rather
 * than presenting it as something the app checked. */
function electoralRollLine(input: DisputeLetterInput): string[] {
  if (input.electoralRollRegistered !== true) return [];
  return ["I am registered on the electoral roll at my current address, which I'd ask you to take into account when investigating this.", ""];
}

function buildIdentityLetter(input: DisputeLetterInput): LetterBody {
  const contact = bureauContact(input.bureau);
  const bodyLines: string[] = [
    "Dear Sir or Madam,",
    "",
    `${subjectLine(input)} — request to correct personal data`,
    "",
    "I am writing to request correction of inaccurate personal data under Article 16 of the UK GDPR (right to rectification) and the Data Protection Act 2018.",
    "",
  ];
  const messages = input.identityAlertMessages.length > 0 ? input.identityAlertMessages : ["[Describe the mismatched name/date-of-birth entry and which account(s) it appears on.]"];
  for (const message of messages) {
    bodyLines.push(message);
    bodyLines.push("");
  }
  bodyLines.push(...electoralRollLine(input));
  bodyLines.push(
    "Please investigate how this discrepancy arose, contact the organisation(s) concerned to have my details corrected, or confirm in writing if these records do not in fact belong to me."
  );
  bodyLines.push(...closing(input));
  return { recipientLines: contact ? addressBlock(contact) : ["[Credit reference agency address]"], bodyLines };
}

function buildCcjLetter(input: DisputeLetterInput): LetterBody {
  const bodyLines: string[] = [
    "Dear Sir or Madam,",
    "",
    `${subjectLine(input)} — County Court Judgment`,
    "",
    "I am writing about the following County Court Judgment(s) recorded against me, which my credit report does not show as satisfied:",
    "",
  ];
  if (input.ccjs.length === 0) {
    bodyLines.push("- [Case number, date, and amount — see your judgment paperwork or the report's CCJ entry.]");
  }
  for (const ccj of input.ccjs) {
    bodyLines.push(`- Case ${ccj.caseNumber ?? "[case number — see your judgment paperwork]"}, dated ${ccj.date}, for £${ccj.amount.toLocaleString("en-GB")}.`);
  }
  bodyLines.push("");
  bodyLines.push(
    "If this has already been paid in full, please treat this as a request for confirmation and, if applicable, a Certificate of Satisfaction (form N443) so the credit reference agencies can update their records. If it has not been paid, please confirm the current balance outstanding and any accepted way to settle it."
  );
  if (COURT_CONTACT.note) bodyLines.push(`Note: ${COURT_CONTACT.note}`);
  bodyLines.push(...closing(input));
  return { recipientLines: addressBlock(COURT_CONTACT), bodyLines };
}

function buildDefaultValidationLetter(input: DisputeLetterInput): LetterBody {
  const largest = [...input.activeDefaults].sort((a, b) => b.balance - a.balance)[0];
  const accountLine = largest
    ? `My credit report shows an account with you, ${largest.lenderName}${largest.bureauRef ? ` (reference ${largest.bureauRef})` : ""}, in default since ${largest.defaultDate ?? "[date]"} with a balance of £${largest.balance.toLocaleString("en-GB")}.`
    : "My credit report shows an account with you in default. [Add the account reference, default date, and balance from the report.]";
  const bodyLines: string[] = [
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
  bodyLines.push(...closing(input));
  return { recipientLines: ["[Lender's correspondence address — see \"Accounts\" in the app for a place to save this]"], bodyLines };
}

function buildGeneralAccuracyLetter(input: DisputeLetterInput): LetterBody {
  const contact = bureauContact(input.bureau);
  const bodyLines: string[] = [
    "Dear Sir or Madam,",
    "",
    `${subjectLine(input)} — request to investigate accuracy of report entries`,
    "",
    "I am writing to query the accuracy of one or more entries on my credit report. [Describe the specific entry/entries you are querying and why — e.g. an account you don't recognise, a balance that looks wrong, or a status that doesn't match your own records.]",
    "",
    "Please investigate and let me know the outcome, including contacting the relevant lender(s) if needed.",
  ];
  bodyLines.push(...closing(input));
  return { recipientLines: contact ? addressBlock(contact) : ["[Credit reference agency address]"], bodyLines };
}

/**
 * A formal statutory notice under section 159(3) of the Consumer Credit
 * Act 1974. This is deliberately NOT described anywhere as "legally
 * binding" — it's a statutory right to have your own up-to-200-word
 * statement added to an entry, not a court order, and overstating it
 * would mislead the person sending it. The correction statement itself
 * must come from the user ("drawn up by the objector" per s.159(3)) —
 * this function never invents or paraphrases one.
 */
function buildNoticeOfCorrectionLetter(input: DisputeLetterInput): LetterBody {
  const contact = bureauContact(input.bureau);
  const statement = input.correctionStatement?.trim();
  const wordCount = statement ? countWords(statement) : 0;
  const overLimit = wordCount > NOTICE_OF_CORRECTION_WORD_LIMIT;

  const bodyLines: string[] = [
    "Dear Sir or Madam,",
    "",
    `${subjectLine(input)} — formal statutory notice under section 159(3) of the Consumer Credit Act 1974`,
    "",
    "This is a formal statutory notice, not a general enquiry — please route it to whichever team handles section 159 notices of correction.",
    "",
    "I previously asked you, under section 159(1) of the Consumer Credit Act 1974, to remove or amend an entry on my file that I believe is incorrect and likely to prejudice me. Under section 159(3), I am now formally requiring you to add the following notice of correction to the relevant entry, exactly as drawn up by me below:",
    "",
    '"' + (statement || "[Write your own statement here — up to 200 words, describing what is wrong and what the entry should say instead. This must be your own words: the Act requires the notice to be drawn up by you, not generated on your behalf.]") + '"',
    "",
  ];

  if (overLimit) {
    bodyLines.push(
      `Note: the statement above is currently ${wordCount} words, over the 200-word limit set by section 159(3). Please shorten it before sending this letter.`
    );
    bodyLines.push("");
  }

  if (input.identityAlertMessages.length > 0) {
    bodyLines.push("For reference, the entry (or entries) this concerns:");
    for (const message of input.identityAlertMessages) bodyLines.push(message);
    bodyLines.push("");
  }

  bodyLines.push(...electoralRollLine(input));
  bodyLines.push(
    `Please confirm, within 28 days as required by section 159(4) of the Act, that you have received this notice and that you intend to comply with it. If you consider this notice to be incorrect, defamatory, frivolous, scandalous, or otherwise unsuitable for publication, please tell me your reasons in writing — if we cannot agree, either of us may then apply to ${ICO_CONTACT.name}, which is the relevant authority for an individual under section 159(8) of the Act, to resolve the matter.`
  );
  bodyLines.push(...closing(input));
  return { recipientLines: contact ? addressBlock(contact) : ["[Credit reference agency address]"], bodyLines };
}

/** The original combined letter — identity paragraph and/or CCJ
 * paragraph, whichever apply, addressed to the bureau. Kept as the
 * "auto" default so a report with nothing unusual still gets a sensible
 * general-purpose letter. */
function buildAutoLetter(input: DisputeLetterInput): LetterBody {
  const contact = bureauContact(input.bureau);
  const bodyLines: string[] = [
    "Dear Sir or Madam,",
    "",
    `${subjectLine(input)} — request to correct/dispute information on my credit report`,
    "",
  ];

  if (input.identityAlertMessages.length > 0) {
    bodyLines.push(
      "I am writing to request correction of inaccurate personal data under Article 16 of the UK GDPR (right to rectification) and the Data Protection Act 2018."
    );
    for (const message of input.identityAlertMessages) bodyLines.push(message);
    bodyLines.push(
      "Please investigate how this discrepancy arose, contact the organisation(s) concerned to have my name and date of birth corrected, or confirm in writing if these records do not in fact belong to me."
    );
    bodyLines.push("");
  }

  if (input.ccjs.length > 0) {
    bodyLines.push(
      `My report shows ${input.ccjs.length} County Court Judgment${input.ccjs.length > 1 ? "s" : ""} not marked as satisfied. If any of these has in fact been paid, please treat this letter as a request to update the record accordingly once I provide a Certificate of Satisfaction, or advise what further evidence is required.`
    );
    bodyLines.push("");
  }

  if (input.identityAlertMessages.length === 0 && input.ccjs.length === 0) {
    bodyLines.push("I am writing to query the accuracy of one or more entries on my credit report. [Describe the specific entry you are querying.]");
    bodyLines.push("");
  }

  bodyLines.push(...closing(input));
  return { recipientLines: contact ? addressBlock(contact) : ["[Credit reference agency address]"], bodyLines };
}

function buildLetterBody(input: DisputeLetterInput, templateId: DisputeTemplateId): LetterBody {
  switch (templateId) {
    case "identity":
      return buildIdentityLetter(input);
    case "ccj":
      return buildCcjLetter(input);
    case "default_validation":
      return buildDefaultValidationLetter(input);
    case "general_accuracy":
      return buildGeneralAccuracyLetter(input);
    case "notice_of_correction":
      return buildNoticeOfCorrectionLetter(input);
    case "auto":
    default:
      return buildAutoLetter(input);
  }
}

/**
 * Builds a ready-to-send dispute/query letter body. `templateId` picks
 * which situation the letter addresses; "auto" (the default) covers
 * whatever was actually found on the report. The caller still needs to
 * fill in the person's own contact details and anything in [square
 * brackets] — we deliberately don't fabricate those.
 */
export function generateDisputeText(input: DisputeLetterInput, templateId: DisputeTemplateId = "auto"): string {
  const { recipientLines, bodyLines } = buildLetterBody(input, templateId);
  return [...senderLines(input), "", ...recipientLines, "", todayLine(), "", ...bodyLines].join("\n");
}

export interface DisputeLetterParts {
  senderLines: string[];
  recipientLines: string[];
  date: string;
  bodyLines: string[];
}

/**
 * Same letter, kept as structured parts instead of one flattened string —
 * used by the envelope-ready PDF renderer, which needs to place the
 * recipient address at an exact millimetre position inside a window
 * cut-out rather than wherever it happens to fall in a top-to-bottom
 * text dump.
 */
export function buildDisputeLetterParts(input: DisputeLetterInput, templateId: DisputeTemplateId = "auto"): DisputeLetterParts {
  const { recipientLines, bodyLines } = buildLetterBody(input, templateId);
  return { senderLines: senderLines(input), recipientLines, date: todayLine(), bodyLines };
}
