import { AccountStatusName, ParsedAccount, ParsedAddress, ParsedEvent, ParsedReport, ParsedStatusEntry, emptyParsedReport } from "./types";
import { parseMoney, toLines, ukDateToIso } from "./shared";

/**
 * Parser for Equifax UK's consumer credit report PDF (the "Mr X's Equifax
 * Credit Report" export), built and checked against a real 109-page sample.
 *
 * Equifax's layout is fundamentally different from Experian's glued-block
 * format: it's a numbered-section report (1. Personal Information ... 10.
 * CIFAS) where every credit agreement is its own bordered "Label | Value"
 * table, one row per field, followed by a separate month-by-month payment
 * history grid. Crucially, pdf-parse extracts each table row as "LabelValue"
 * glued together with NO separator (no colon, unlike Experian) — e.g.
 *
 *   Account NumberXXXXXXX7863
 *   Current Balance£0
 *   Default DateN/A
 *
 * — so label/value extraction here anchors on the literal label text itself
 * rather than a colon. See backend/README.md § Parsing engine for the scope
 * of what this covers (accounts, defaults/arrears, searches, a conservative
 * court-records fallback) and what it deliberately doesn't (electoral
 * register, gone-away records, CIFAS, property valuation — none of these
 * feed the app's core features, and this parser wasn't validated against a
 * real sample containing them).
 */

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Every page repeats this three-line header/footer; stripping it up front
 * keeps it from becoming noise inside a flattened block's text. */
const PAGE_BOILERPLATE = [/^Mr\.?\s.+ - Equifax Credit Report - \d{2}\/\d{2}\/\d{4}$/, /^\d+\s+of\s+\d+$/, /^Consumer Protected$/];

function toCleanLines(text: string): string[] {
  return toLines(text).filter((l) => !PAGE_BOILERPLATE.some((re) => re.test(l)));
}

/** Section headings appear twice — once in the Table of Contents, once as
 * the real heading — so we take the *last* match to skip past the ToC. */
function lastSectionIndex(text: string, heading: string): number {
  return text.toLowerCase().lastIndexOf(heading.toLowerCase());
}

function sliceSection(text: string, startHeading: string, endHeading: string): string {
  const start = lastSectionIndex(text, startHeading);
  if (start < 0) return "";
  const end = lastSectionIndex(text, endHeading);
  return text.slice(start, end > start ? end : undefined);
}

// ---------------------------------------------------------------------------
// Credit agreements
// ---------------------------------------------------------------------------

/** The closed set of account-type prefixes Equifax uses in a block's header
 * line, e.g. "Credit Card from CAPITAL ONE (EUROPE) PLC (I)". Anchoring on
 * this exact list (rather than a generic "capitalised words + from") avoids
 * false positives from ordinary prose that happens to contain " from ". */
const ACCOUNT_HEADER = /^(Credit Card|Loan|Communications Supplier|Basic Bank Account|Current Account|Mail Order|Hire Purchase|Agreement) from (.+)$/;

const DATE_LABELS = ["Start Date", "Date Updated", "Date last Delinquent", "Date Satisfied", "Default Date", "Date of Birth"];
const MONEY_LABELS = ["Credit Limit", "Start Balance", "Current Balance", "Default/Delinquent Balance", "Payment Amount", "Previous Statement Balance", "Cash Advance Amount"];
const TEXT_LABELS = [
  "Account Number",
  "Address On Agreement",
  "Account Holder",
  "Repayment Terms",
  "Status",
  "Payment Frequency",
  "Number of Cash Advances During Month",
  "Credit Limit Change",
  "Minimum Payment",
  "Promotional Rate",
  "Supplementary Information",
];
const ACCOUNT_LABELS = [...DATE_LABELS, ...MONEY_LABELS, ...TEXT_LABELS];

/**
 * Pulls "LabelValue" pairs out of a flattened block, where label and value
 * are glued with no separator. Date/money fields use a tight value pattern
 * right after the label; free-text fields capture everything up to the next
 * known label (or end of block) — mirrors experianParser's extractLabels,
 * adapted for Equifax's colon-free layout.
 */
function extractLabels(blockText: string): Record<string, string> {
  const found: Record<string, string> = {};
  const alternation = ACCOUNT_LABELS.map(escapeRegExp).join("|");

  for (const label of ACCOUNT_LABELS) {
    const escaped = escapeRegExp(label);
    let re: RegExp;
    if (DATE_LABELS.includes(label)) {
      re = new RegExp(`${escaped}(\\d{2}\\/\\d{2}\\/\\d{4})`);
    } else if (MONEY_LABELS.includes(label)) {
      re = new RegExp(`${escaped}(£-?[\\d,]+(?:\\.\\d+)?|N\\/A)`);
    } else {
      re = new RegExp(`${escaped}([\\s\\S]*?)(?=(?:${alternation})|$)`);
    }
    const m = blockText.match(re);
    if (m && m[1] && m[1].trim()) found[label] = m[1].trim();
  }
  return found;
}

function stripLiabilityTag(lenderRaw: string): string {
  // "CAPITAL ONE (EUROPE) PLC (I)" / "AMEX GROUP - (I)" -> drop the
  // trailing individual/joint tag, which isn't part of the lender's name.
  return lenderRaw.replace(/\s*-?\s*\((I|J)\)\s*$/, "").trim();
}

/**
 * Equifax's own "Status" field is a plain English sentence ("Up to date
 * with payments", "Default", "Settled", "2 payments in arrears") rather
 * than Experian's balance-field trick, so classification reads it directly
 * — corroborated by Default Date / Date Satisfied where present, the same
 * "don't trust the label alone" spirit as classifyAccountStatus.
 */
function classifyEquifaxStatus(statusText: string | undefined, defaultDate: string | undefined, satisfactionDate: string | undefined): AccountStatusName {
  if (defaultDate) return satisfactionDate ? "SATISFIED" : "DEFAULT";
  const label = (statusText ?? "").toLowerCase();
  if (/settl|satisf/.test(label)) return "SETTLED";
  if (/default/.test(label)) return "DEFAULT";
  if (/up to date/.test(label)) return "ACTIVE";
  if (/arrears/.test(label)) return "ACTIVE";
  // "Inactive" (Appendix A code N) means dormant, not closed or in any
  // kind of difficulty — still an open, non-defaulted account.
  if (/inactive/.test(label)) return "ACTIVE";
  return "UNKNOWN";
}

/**
 * Best-effort expansion of the "Payment History/ Account Number: X" grid.
 * Each year's row is a single token of the year glued to that year's status
 * codes (all single characters — see Appendix A), e.g. "2025000000000000".
 * A full row is always exactly 12 codes (Jan-Dec). A short row only occurs
 * at the very top (the current/report year, not yet finished — left-aligned
 * from January) or the very bottom (the oldest year shown, truncated by
 * Equifax's ~5-year retention window — right-aligned ending December),
 * confirmed against the real sample's own start dates and retention notes.
 * A short row anywhere else can't be aligned with confidence, so it's
 * skipped rather than guessed.
 */
function extractPaymentHistory(blockText: string): ParsedStatusEntry[] {
  const gridMatch = blockText.match(/Payment History\/ Account Number:\s*[A-Za-z0-9]+\s+JFMAMJJASOND\s+([\s\S]*?)(?=See Appendix A|$)/);
  if (!gridMatch) return [];

  const rows = gridMatch[1]
    .trim()
    .split(/\s+/)
    .filter((t) => /^\d{4}/.test(t))
    .map((t) => ({ year: t.slice(0, 4), codes: t.slice(4).split("") }));

  const entries: ParsedStatusEntry[] = [];
  rows.forEach((row, i) => {
    let months: number[];
    if (row.codes.length === 12) {
      months = Array.from({ length: 12 }, (_, m) => m + 1);
    } else if (i === 0) {
      months = Array.from({ length: row.codes.length }, (_, m) => m + 1);
    } else if (i === rows.length - 1) {
      const startMonth = 12 - row.codes.length + 1;
      months = Array.from({ length: row.codes.length }, (_, m) => startMonth + m);
    } else {
      return; // an unexpected partial row in the middle of the grid
    }
    row.codes.forEach((code, idx) => {
      entries.push({ periodDate: `${row.year}-${String(months[idx]).padStart(2, "0")}-01`, statusCode: code });
    });
  });
  return entries;
}

function splitAccountBlocks(sectionText: string): string[][] {
  const lines = toCleanLines(sectionText);
  const blocks: string[][] = [];
  let current: string[] | null = null;

  for (const line of lines) {
    if (ACCOUNT_HEADER.test(line)) {
      if (current) blocks.push(current);
      current = [line];
      continue;
    }
    if (current) current.push(line);
  }
  if (current) blocks.push(current);
  return blocks;
}

function parseAccountBlock(block: string[], warnings: string[], events: ParsedEvent[]): ParsedAccount | null {
  const headerMatch = block[0].match(ACCOUNT_HEADER);
  if (!headerMatch) return null;
  const accountType = headerMatch[1];
  const lenderName = stripLiabilityTag(headerMatch[2]);

  const blockText = block.join(" ");
  const labels = extractLabels(blockText);

  if (!labels["Account Number"]) {
    warnings.push(`Could not find an account number in a "${accountType} from ${lenderName}" block — skipped.`);
    return null;
  }

  const defaultDate = ukDateToIso(labels["Default Date"]);
  const satisfactionDate = ukDateToIso(labels["Date Satisfied"]);
  const statusText = labels["Status"];
  const status = classifyEquifaxStatus(statusText, defaultDate, satisfactionDate);
  const defaultBalance = parseMoney(labels["Default/Delinquent Balance"]);

  const arrearsMatch = statusText?.match(/(\d+)\s+payments?\s+in\s+arrears/i);
  if (arrearsMatch) {
    events.push({
      type: "ARREARS",
      date: ukDateToIso(labels["Date Updated"]) ?? new Date().toISOString().slice(0, 10),
      amount: defaultBalance,
      accountRef: labels["Account Number"],
      detail: { lenderName, monthsInArrears: Number(arrearsMatch[1]) },
    });
  }

  return {
    bureauRef: labels["Account Number"],
    lenderName,
    accountType,
    status,
    openedDate: ukDateToIso(labels["Start Date"]),
    currentBalance: parseMoney(labels["Current Balance"]),
    creditLimit: parseMoney(labels["Credit Limit"]),
    defaultDate,
    defaultBalance,
    satisfactionDate,
    linkedAddress: labels["Address On Agreement"],
    recordedName: labels["Account Holder"]?.replace(/^(MR|MRS|MS|MX|MISS|DR)\s+/i, "").trim() || undefined,
    recordedDob: ukDateToIso(labels["Date of Birth"]),
    statusHistory: extractPaymentHistory(blockText),
  };
}

// ---------------------------------------------------------------------------
// Personal information / addresses
// ---------------------------------------------------------------------------

function parseAddressSection(personalInfoText: string): ParsedAddress[] {
  const lines = toCleanLines(personalInfoText);
  const addresses: ParsedAddress[] = [];
  let label: string | null = null;
  let buffer: string[] = [];

  const flush = () => {
    if (label && buffer.length > 0) addresses.push({ line: buffer.join(", "), source: label });
    buffer = [];
  };
  // Prose/boilerplate that shows up between address headings — ends the
  // current buffer without itself starting a new address.
  const RESET_LINE = /^(1\. Personal Information|These are the addresses|Linked addresses are|Addresses become linked|You have provided|You tell a lender|We keep address links|No data present|There is no data present)/i;

  for (const line of lines) {
    if (/^Current Address$/i.test(line)) {
      flush();
      label = "Current Address";
      continue;
    }
    if (/^Previous Addresses$/i.test(line)) {
      flush();
      label = null;
      continue;
    }
    const prevMatch = line.match(/^PREVIOUS ADDRESS (\d+)$/i);
    if (prevMatch) {
      flush();
      label = `Previous Address ${prevMatch[1]}`;
      continue;
    }
    if (/^Linked Addresses$/i.test(line)) {
      flush();
      label = null;
      continue;
    }
    const linkedMatch = line.match(/^LINKED ADDRESS (\d+)$/i);
    if (linkedMatch) {
      flush();
      label = `Linked Address ${linkedMatch[1]}`;
      continue;
    }
    if (RESET_LINE.test(line)) {
      flush();
      label = null;
      continue;
    }
    if (label) buffer.push(line);
  }
  flush();
  return addresses;
}

// ---------------------------------------------------------------------------
// Searches (section 7)
// ---------------------------------------------------------------------------

const SEARCH_HEADER = /^(\d{2}\/\d{2}\/\d{4})(.+)$/;
// The data row glues the consumer's own name onto their DOB (or "N/A") onto
// the search type onto the Yes/No joint-application flag with no separator
// anywhere, e.g. "TAYOOLAOYE10/10/1979Credit ApplicationNo" — we don't need
// the name, so we anchor on the DOB-or-N/A token and take everything after
// it up to the trailing Yes/No.
const SEARCH_ROW = /(?:\d{2}\/\d{2}\/\d{4}|N\/A)([A-Za-z /]*?)(Yes|No)\s*$/;

/**
 * Each search entry's actual data row ("TAYOOLAOYE10/10/1979Credit
 * ApplicationNo") is always its own physical line, but it's followed by an
 * unbounded amount of unrelated boilerplate before the next entry (address-
 * context sub-headings, "No data present" filler for empty groupings) — so
 * this flushes an entry the moment its data row is found, rather than
 * accumulating lines up to the next date-header. Accumulating them was the
 * original bug: SEARCH_ROW's trailing `$` anchor needs the data row to be
 * at the very end of whatever text it's matched against, and that filler
 * text pushed the real data row into the middle of a much longer string.
 */
function parseSearchesSection(sectionText: string, warnings: string[]): ParsedEvent[] {
  const lines = toCleanLines(sectionText);
  const events: ParsedEvent[] = [];
  let hard = true; // "Hard Searches" always comes first in this section
  let current: { date: string; searcher: string } | null = null;

  for (const line of lines) {
    if (/^Hard Searches$/i.test(line)) {
      hard = true;
      current = null;
      continue;
    }
    if (/^Soft Searches$/i.test(line)) {
      hard = false;
      current = null;
      continue;
    }
    const headerMatch = line.match(SEARCH_HEADER);
    if (headerMatch) {
      current = { date: ukDateToIso(headerMatch[1]) ?? new Date().toISOString().slice(0, 10), searcher: headerMatch[2].trim() };
      continue;
    }
    if (!current) continue; // boilerplate/address-context noise between entries

    const rowMatch = line.match(SEARCH_ROW);
    if (rowMatch) {
      events.push({
        type: "SEARCH",
        date: current.date,
        detail: {
          searchedBy: current.searcher,
          applicationType: rowMatch[1]?.trim() || undefined,
          jointApplication: rowMatch[2].toUpperCase() === "YES",
          hard,
        },
      });
      current = null;
    }
  }

  if (events.length === 0) warnings.push("No search history was recognised in the Searches section.");
  return events;
}

// ---------------------------------------------------------------------------
// Court and other public records (section 5) — conservative fallback
// ---------------------------------------------------------------------------

const CCJ_KEYWORDS = /\b(ccj|county court judgment|judgement|judgment)\b/i;
const DATE_RE = /\b(\d{1,2}\/\d{1,2}\/\d{4})\b/;
const MONEY_RE = /£\s?-?[\d,]+(?:\.\d+)?/;

function scanForCourtEvents(sectionText: string): ParsedEvent[] {
  const events: ParsedEvent[] = [];
  for (const line of toCleanLines(sectionText)) {
    if (!CCJ_KEYWORDS.test(line)) continue;
    events.push({
      type: "CCJ",
      date: ukDateToIso(line.match(DATE_RE)?.[1]) ?? new Date().toISOString().slice(0, 10),
      amount: parseMoney(line.match(MONEY_RE)?.[0]),
      detail: { sourceLine: line },
    });
  }
  return events;
}

/**
 * The public-record categories Equifax documents as the only things this
 * section can contain: County Court Judgments (Decrees in Scotland),
 * Administration Orders, Bankruptcies, and Individual Voluntary
 * Arrangements (Trust Deeds in Scotland). The real sample this parser was
 * built from has none of these on it (all three "Public Records at ..."
 * subsections read "No data present"), so this exact table has never been
 * seen — but every other agreement/account block on this same real report
 * uses one consistent shape (a heading line, then bordered "Label Value"
 * rows glued with no separator), and there's no reason to expect this
 * section's own tables to break from that. This recognises that same
 * shape for a category heading; anything it can't confidently parse this
 * way falls through to the conservative keyword scan below.
 */
const COURT_RECORD_HEADER = /^(County Court Judgment|High Court Judgment|Decree|Administration Order|Bankruptcy|Individual Voluntary Arrangement|Trust Deed)$/i;

const COURT_DATE_LABELS = ["Judgment Date", "Decree Date", "Date Registered", "Satisfied Date"];
const COURT_MONEY_LABELS = ["Judgment Amount", "Decree Amount"];
const COURT_TEXT_LABELS = ["Court Name", "Case Number", "Status", "Registered Name", "Registered Address"];
const COURT_LABELS = [...COURT_DATE_LABELS, ...COURT_MONEY_LABELS, ...COURT_TEXT_LABELS];

/** Same glued-LabelValue extraction as extractLabels, over the court-record label set. */
function extractCourtLabels(blockText: string): Record<string, string> {
  const found: Record<string, string> = {};
  const alternation = COURT_LABELS.map(escapeRegExp).join("|");

  for (const label of COURT_LABELS) {
    const escaped = escapeRegExp(label);
    let re: RegExp;
    if (COURT_DATE_LABELS.includes(label)) {
      re = new RegExp(`${escaped}(\\d{2}\\/\\d{2}\\/\\d{4})`);
    } else if (COURT_MONEY_LABELS.includes(label)) {
      re = new RegExp(`${escaped}(£-?[\\d,]+(?:\\.\\d+)?|N\\/A)`);
    } else {
      re = new RegExp(`${escaped}([\\s\\S]*?)(?=(?:${alternation})|$)`);
    }
    const m = blockText.match(re);
    if (m && m[1] && m[1].trim()) found[label] = m[1].trim();
  }
  return found;
}

// Each "Public Records at ..." subsection heading closes off whatever
// judgment/order block came before it — without this, the last Label/Value
// field of the final block in a subsection (usually "Status") would run
// past the block's real end and swallow the next subsection's heading and
// "No data present" boilerplate along with it.
const PUBLIC_RECORDS_SUBHEADING = /^Public Records at /i;

function splitCourtRecordBlocks(sectionText: string): string[][] {
  const lines = toCleanLines(sectionText);
  const blocks: string[][] = [];
  let current: string[] | null = null;

  for (const line of lines) {
    if (COURT_RECORD_HEADER.test(line.trim())) {
      if (current) blocks.push(current);
      current = [line.trim()];
      continue;
    }
    if (PUBLIC_RECORDS_SUBHEADING.test(line.trim())) {
      if (current) blocks.push(current);
      current = null;
      continue;
    }
    if (current) current.push(line);
  }
  if (current) blocks.push(current);
  return blocks;
}

function parseCourtRecordBlock(block: string[], warnings: string[]): ParsedEvent | null {
  const category = block[0];
  const blockText = block.join(" ");
  const labels = extractCourtLabels(blockText);

  const date = labels["Judgment Date"] ?? labels["Decree Date"] ?? labels["Date Registered"];
  if (!date) {
    warnings.push(`A "${category}" entry in section 5 was recognised by heading, but its date field didn't match the expected layout — reviewed with the generic scanner instead.`);
    return null;
  }

  return {
    type: "CCJ",
    date: ukDateToIso(date) ?? new Date().toISOString().slice(0, 10),
    amount: parseMoney(labels["Judgment Amount"] ?? labels["Decree Amount"]),
    detail: {
      category,
      courtName: labels["Court Name"],
      caseNumber: labels["Case Number"],
      status: labels["Status"],
      satisfiedDate: ukDateToIso(labels["Satisfied Date"]),
      registeredName: labels["Registered Name"],
      registeredAddress: labels["Registered Address"],
    },
  };
}

/**
 * Rather than guess a structure with nothing to go on, this only recognises
 * the "no data" case and the inferred Label/Value table with full
 * confidence; anything else falls back to the same conservative keyword
 * scan the generic parser uses, with a warning so it gets reviewed by eye.
 * Even a successful structured parse still warns, since the table shape
 * itself remains unconfirmed against a real populated section.
 */
function parseCourtRecordsSection(sectionText: string, warnings: string[]): ParsedEvent[] {
  // Counts only the "No data present" heading lines themselves — a plain
  // substring count would double-count, since each one is immediately
  // followed by an explanatory sentence that also contains the phrase
  // ("There is no data present in this section...").
  const noDataCount = toCleanLines(sectionText).filter((l) => /^No data present$/i.test(l)).length;
  if (noDataCount >= 3) return [];

  const blocks = splitCourtRecordBlocks(sectionText);
  const events = blocks.map((b) => parseCourtRecordBlock(b, warnings)).filter((e): e is ParsedEvent => e !== null);
  if (events.length > 0) {
    warnings.push(
      "Section 5 (Court and other public records) contains one or more structured judgment/order entries. This table layout has never been confirmed against a real Equifax report (the sample this parser was built from had none) — it was inferred from the bordered Label/Value table style used everywhere else in this report, so double-check these entries by eye."
    );
    return events;
  }

  warnings.push(
    "Section 5 (Court and other public records) doesn't read as entirely empty, but Equifax's judgment-table layout hasn't been validated against a real sample yet — these entries were read with the generic scanner and should be checked carefully."
  );
  return scanForCourtEvents(sectionText);
}

// ---------------------------------------------------------------------------

export function parseEquifaxReport(rawText: string): ParsedReport {
  const report = emptyParsedReport("EQUIFAX");

  const nameMatch = rawText.match(/^((?:Mr|Mrs|Ms|Mx|Miss|Dr)\.?\s+.+?) - Equifax Credit Report - \d{2}\/\d{2}\/\d{4}$/m);
  if (nameMatch) {
    report.applicantName = nameMatch[1].replace(/^(Mr|Mrs|Ms|Mx|Miss|Dr)\.?\s+/i, "").trim();
  }

  const personalInfoText = sliceSection(rawText, "1. Personal Information", "2. Financial Associates");
  if (personalInfoText) report.addresses = parseAddressSection(personalInfoText);

  const creditAgreementsText = sliceSection(rawText, "4. Credit Agreements", "5. Court and other public records");
  if (creditAgreementsText) {
    for (const block of splitAccountBlocks(creditAgreementsText)) {
      const account = parseAccountBlock(block, report.warnings, report.events);
      if (!account) continue;
      report.accounts.push(account);
      if (account.defaultDate) {
        report.events.push({
          type: "DEFAULT",
          date: account.defaultDate,
          amount: account.defaultBalance,
          accountRef: account.bureauRef,
          detail: { lenderName: account.lenderName },
        });
      }
    }
  }
  // The applicant's own DOB isn't printed anywhere in section 1 (only
  // addresses) — best-effort fallback to the first account block that
  // recorded one, same as most of that account's other identity fields.
  report.dateOfBirth = report.accounts.find((a) => a.recordedDob)?.recordedDob;

  const courtRecordsText = sliceSection(rawText, "5. Court and other public records", "6. Notice of Correction");
  if (courtRecordsText) report.events.push(...parseCourtRecordsSection(courtRecordsText, report.warnings));

  const searchesText = sliceSection(rawText, "7. Searches", "8. Property Valuation");
  if (searchesText) report.events.push(...parseSearchesSection(searchesText, report.warnings));

  if (report.accounts.length === 0) {
    report.warnings.push("No credit accounts were recognised — the file may not be an Equifax consumer report, or its layout has changed.");
  }

  return report;
}
