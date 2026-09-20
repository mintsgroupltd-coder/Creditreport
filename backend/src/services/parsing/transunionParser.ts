import { AccountStatusName, ParsedAccount, ParsedEvent, ParsedReport, emptyParsedReport } from "./types";
import { parseMoney, toLines, ukDateToIso } from "./shared";

/**
 * Parser for TransUnion UK's consumer "My Credit Report" PDF export, built
 * and checked against a real 189-page sample (the same rigor as the
 * Experian and Equifax parsers — see backend/README.md § Parsing engine
 * for exactly what this covers and what it deliberately doesn't).
 *
 * The layout is a long-form report (Personal Information, Financial
 * Account Information split into "Credit cards" / "Personal loans and
 * mortgages" / "Other accounts" / "Closed accounts", Searches, Address
 * Links, Public Information) where every account is its own "Label Value"
 * table with NO separator between label and value, e.g.
 *
 *   Account numberXXXXXXXXXXXXXXXX3139 0
 *   Opening balance£1,309
 *   Date of default01/06/2023
 *
 * — the same glued-label problem Equifax has, addressed the same way
 * (anchor on the literal label text). But TransUnion's export has one
 * problem Equifax's real sample didn't: the monthly Status/Balance/Limit/
 * Statement/Payment history grids are ALSO glued together with no
 * separator between adjacent months' figures (e.g. "659609559509459..."
 * for nine months' balances) and no reliable column width to split on.
 * Reconstructing those would mean guessing which digits belong to which
 * month, so this parser deliberately doesn't attempt it — see
 * parseTransUnionReport()'s warning and backend/README.md for the detail.
 */

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sliceBetween(text: string, startMarker: string, endMarker: string): string {
  const start = text.indexOf(startMarker);
  if (start < 0) return "";
  const contentStart = start + startMarker.length;
  const end = text.indexOf(endMarker, contentStart);
  // Excludes the start marker itself from the returned slice — some callers
  // (parseSearchesSection) would otherwise treat the marker's own heading
  // text as an unmatched line of search/account content rather than a
  // section boundary to discard.
  return text.slice(contentStart, end > contentStart ? end : undefined);
}

// ---------------------------------------------------------------------------
// Date formats — TransUnion uses three different ones in the same document
// ---------------------------------------------------------------------------

const LONG_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "October 10, 1979" -> "1979-10-10". Used only for Personal Information's DOB/report date. */
function longMonthDayYearToIso(text: string | undefined): string | undefined {
  if (!text) return undefined;
  const m = text.trim().match(/^([A-Za-z]+) (\d{1,2}), (\d{4})$/);
  if (!m) return undefined;
  const monthIndex = LONG_MONTHS.findIndex((mo) => mo.toLowerCase() === m[1].toLowerCase());
  if (monthIndex < 0) return undefined;
  return `${m[3]}-${String(monthIndex + 1).padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}

/** "20 Sep 2026" -> "2026-09-20". Used for account/search "Updated"-style dates. */
function shortDayMonthYearToIso(text: string | undefined): string | undefined {
  if (!text) return undefined;
  const m = text.trim().match(/^(\d{1,2}) ([A-Za-z]{3,4}) (\d{4})$/);
  if (!m) return undefined;
  const monthIndex = SHORT_MONTHS.findIndex((mo) => m[2].toLowerCase().startsWith(mo.toLowerCase()));
  if (monthIndex < 0) return undefined;
  return `${m[3]}-${String(monthIndex + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Personal information
// ---------------------------------------------------------------------------

function parsePersonalInfo(rawText: string, report: ParsedReport): void {
  const personalText = rawText.slice(0, Math.max(rawText.indexOf("Financial Account Information"), 0) || rawText.length);
  const lines = toLines(personalText);

  const nameLine = lines.find((l) => l.startsWith("Name"));
  if (nameLine) {
    report.applicantName = nameLine
      .slice("Name".length)
      .replace(/^(Mr|Mrs|Ms|Mx|Miss|Dr)\.?\s+/i, "")
      .trim();
  }

  const dobLine = lines.find((l) => l.startsWith("Date of birth"));
  if (dobLine) report.dateOfBirth = longMonthDayYearToIso(dobLine.slice("Date of birth".length));

  const addrLine = lines.find((l) => l.startsWith("Current address"));
  if (addrLine) report.addresses.push({ line: addrLine.slice("Current address".length).trim(), source: "Current Address" });
}

/**
 * "Address link history" is a clean, deduplicated numbered list of every
 * address TransUnion has a financial record for — far more reliable to
 * read than reconstructing it from the individual "From/To/Source" link
 * records, which repeat the same addresses many times over.
 */
function parseAddressLinkHistory(rawText: string, report: ParsedReport): void {
  const section = sliceBetween(rawText, "Address link history", "Address link details");
  for (const line of toLines(section)) {
    const m = line.match(/^\d+\.\s*(.+)$/);
    if (m) report.addresses.push({ line: m[1].trim(), source: "Address Link" });
  }
}

// ---------------------------------------------------------------------------
// Accounts (Credit cards / Personal loans and mortgages / Other accounts /
// Closed accounts — all four share one table shape, so they're parsed as
// a single continuous stream rather than four separate section parsers)
// ---------------------------------------------------------------------------

const DATE_LABELS = ["Date of birth", "Account start date", "Account holder start date", "Account holder end date", "Account end date", "Payment start date", "Date of default"];
const MONEY_LABELS = ["Opening balance", "Regular payment", "Default balance"];
const TEXT_LABELS = ["Name", "Address", "Account type", "Account number", "Repayment frequency", "Minimum payment"];
const ACCOUNT_LABELS = [...DATE_LABELS, ...MONEY_LABELS, ...TEXT_LABELS];
// Lines that never carry a value themselves but mark where the previous
// field's free-text capture must stop.
const ACCOUNT_TERMINATORS = ["Notice of dispute", "Status history"];

function extractLabels(blockText: string, labels: string[], dateLabels: string[], moneyLabels: string[], terminators: string[]): Record<string, string> {
  const found: Record<string, string> = {};
  const alternation = [...labels, ...terminators].map(escapeRegExp).join("|");

  for (const label of labels) {
    const escaped = escapeRegExp(label);
    let re: RegExp;
    if (dateLabels.includes(label)) {
      re = new RegExp(`${escaped}(\\d{2}\\/\\d{2}\\/\\d{4})`);
    } else if (moneyLabels.includes(label)) {
      re = new RegExp(`${escaped}(£-?[\\d,]+(?:\\.\\d+)?|N\\/A)`);
    } else {
      re = new RegExp(`${escaped}([\\s\\S]*?)(?=(?:${alternation})|$)`);
    }
    const m = blockText.match(re);
    if (m && m[1] && m[1].trim()) found[label] = m[1].trim();
  }
  return found;
}

/** The four status words TransUnion prints on every account's summary row. */
const ACCOUNT_STATUS_WORDS = ["Default", "Up to date", "Settled", "Satisfied"] as const;
// Matches "<anything>£<amount glued to the 'Updated' date, glued to the
// status word>", e.g. "Newday LTD (Aqua)£25131 Aug 2026Up to date". The
// amount and date in the middle are NOT reliably separable (see the file
// comment), so this only pulls out an optional inline organisation-name
// prefix and the trailing status word — both unambiguous.
const ACCOUNT_HEADER_LINE = new RegExp(`^(.*?)£.*(${ACCOUNT_STATUS_WORDS.join("|")})$`);

const NON_ORG_LINES = new Set(["Credit cards", "Personal loans and mortgages", "Other accounts", "Closed accounts", "ORGANISATIONBALANCEUPDATEDSTATUS"]);

/** Best-effort: the organisation name is always the 1-2 lines immediately
 * before the header line, except when it's short enough to sit inline on
 * the header line itself. Filters out the surrounding section heading/
 * table-header/intro-prose noise a rolling window can pick up. */
function deriveOrgNameFromRecent(recent: string[]): string {
  const candidates = recent.filter((l) => l.length > 0 && !NON_ORG_LINES.has(l) && l.split(" ").length <= 10 && l.length <= 90);
  return candidates.slice(-2).join(" ").trim();
}

interface RawAccountBlock {
  orgName: string;
  statusWord: string;
  lines: string[];
}

function splitAccountBlocks(sectionText: string): RawAccountBlock[] {
  const lines = toLines(sectionText);
  const blocks: RawAccountBlock[] = [];
  let current: RawAccountBlock | null = null;
  let recent: string[] = [];

  for (const line of lines) {
    const headerMatch = line.match(ACCOUNT_HEADER_LINE);
    if (headerMatch) {
      if (current) blocks.push(current);
      const inlinePrefix = headerMatch[1].trim();
      current = { orgName: inlinePrefix || deriveOrgNameFromRecent(recent), statusWord: headerMatch[2], lines: [] };
    } else if (current) {
      current.lines.push(line);
    }
    recent.push(line);
    if (recent.length > 4) recent.shift();
  }
  if (current) blocks.push(current);
  return blocks;
}

function classifyStatus(statusWord: string): AccountStatusName {
  switch (statusWord) {
    case "Default":
      return "DEFAULT";
    case "Settled":
      return "SETTLED";
    case "Satisfied":
      return "SATISFIED";
    case "Up to date":
      return "ACTIVE";
    default:
      return "UNKNOWN";
  }
}

function parseAccountBlock(block: RawAccountBlock, warnings: string[]): ParsedAccount | null {
  const blockText = block.lines.join(" ");
  const labels = extractLabels(blockText, ACCOUNT_LABELS, DATE_LABELS, MONEY_LABELS, ACCOUNT_TERMINATORS);

  if (!labels["Account number"]) {
    warnings.push(`Could not find an account number in a "${block.orgName || "(unnamed)"}" block — skipped.`);
    return null;
  }

  const status = classifyStatus(block.statusWord);
  const defaultDate = ukDateToIso(labels["Date of default"]);
  const defaultBalance = parseMoney(labels["Default balance"]);
  // No per-account "Date satisfied" field exists on this report (unlike
  // Judgments, which do have one) — the closest honest proxy for when a
  // settled/satisfied account closed is its own end date.
  const satisfactionDate = status === "SETTLED" || status === "SATISFIED" ? ukDateToIso(labels["Account end date"] ?? labels["Account holder end date"]) : undefined;

  return {
    bureauRef: labels["Account number"],
    lenderName: block.orgName || "Unknown",
    accountType: labels["Account type"] ?? "Unknown",
    status,
    openedDate: ukDateToIso(labels["Account start date"]),
    // The header row's own balance figure can't be reliably separated from
    // the date it's glued to (see file comment), so this only trusts the
    // one balance figure that's never glued to anything else: the amount
    // still outstanding on a defaulted account.
    currentBalance: status === "DEFAULT" ? defaultBalance : undefined,
    creditLimit: undefined,
    defaultDate,
    defaultBalance,
    satisfactionDate,
    linkedAddress: labels["Address"],
    recordedName: labels["Name"]?.replace(/^(Mr|Mrs|Ms|Mx|Miss|Dr)\.?\s+/i, "").trim() || undefined,
    recordedDob: ukDateToIso(labels["Date of birth"]),
    statusHistory: [],
  };
}

// ---------------------------------------------------------------------------
// Judgments (Public Information section)
// ---------------------------------------------------------------------------

const JUDGMENT_DATE_LABELS = ["Judgment date", "Date satisfied", "Date added"];
const JUDGMENT_MONEY_LABELS = ["Amount"];
const JUDGMENT_TEXT_LABELS = ["Name", "Address", "Court name", "Reference number"];
const JUDGMENT_LABELS = [...JUDGMENT_DATE_LABELS, ...JUDGMENT_MONEY_LABELS, ...JUDGMENT_TEXT_LABELS];
const JUDGMENT_TERMINATORS = ["Notice of dispute"];

// "NDN1KF6X2ACountyCourtJudgmentActive" — an optional "ND" (Notice of
// Dispute) badge, an 8-character case reference, the judgment type (its
// spaces don't survive extraction, unlike most other values on this
// report), then the status. Only "County Court Judgment" has actually
// been seen on a real sample; Scotland's equivalent ("Decree") and the
// other categories TransUnion's own Public Information intro names
// (Administration Order, Bankruptcy, Individual Voluntary Arrangement)
// are included on the strength of that same intro text, not confirmed
// against a real populated row.
const JUDGMENT_TYPES = ["CountyCourtJudgment", "Decree", "AdministrationOrder", "Bankruptcy", "IndividualVoluntaryArrangement", "TrustDeed"];
const JUDGMENT_HEADER_LINE = new RegExp(`^(ND)?([A-Z0-9]{6,10})(${JUDGMENT_TYPES.join("|")})(Active|Satisfied)$`);

const CCJ_KEYWORDS = /\b(ccj|county court judgment|judgement|judgment|decree)\b/i;
const DATE_RE = /\b(\d{1,2}\/\d{1,2}\/\d{4})\b/;
const MONEY_RE = /£\s?-?[\d,]+(?:\.\d+)?/;

/** Conservative fallback for a judgment row whose type isn't one of
 * JUDGMENT_TYPES above — same keyword-scan-with-warning approach used by
 * equifaxParser.ts's court-records fallback. */
function scanForJudgmentEvents(sectionText: string): ParsedEvent[] {
  const events: ParsedEvent[] = [];
  for (const line of toLines(sectionText)) {
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

interface RawJudgmentBlock {
  noticeOfDispute: boolean;
  caseNumber: string;
  judgmentType: string;
  statusWord: string;
  lines: string[];
}

function splitJudgmentBlocks(sectionText: string): RawJudgmentBlock[] {
  const lines = toLines(sectionText);
  const blocks: RawJudgmentBlock[] = [];
  let current: RawJudgmentBlock | null = null;

  for (const line of lines) {
    const m = line.match(JUDGMENT_HEADER_LINE);
    if (m) {
      if (current) blocks.push(current);
      current = { noticeOfDispute: !!m[1], caseNumber: m[2], judgmentType: m[3], statusWord: m[4], lines: [] };
      continue;
    }
    if (current) current.lines.push(line);
  }
  if (current) blocks.push(current);
  return blocks;
}

function parseJudgmentBlock(block: RawJudgmentBlock): ParsedEvent {
  const blockText = block.lines.join(" ");
  const labels = extractLabels(blockText, JUDGMENT_LABELS, JUDGMENT_DATE_LABELS, JUDGMENT_MONEY_LABELS, JUDGMENT_TERMINATORS);

  return {
    type: "CCJ",
    date: ukDateToIso(labels["Judgment date"]) ?? new Date().toISOString().slice(0, 10),
    amount: parseMoney(labels["Amount"]),
    detail: {
      caseNumber: block.caseNumber,
      judgmentType: block.judgmentType === "CountyCourtJudgment" ? "County Court Judgment" : block.judgmentType,
      courtName: labels["Court name"],
      isSatisfied: block.statusWord === "Satisfied",
      satisfiedDate: ukDateToIso(labels["Date satisfied"]),
      noticeOfDispute: block.noticeOfDispute,
      recordedName: labels["Name"],
    },
  };
}

function parseJudgmentsSection(rawText: string, warnings: string[]): ParsedEvent[] {
  const section = sliceBetween(rawText, "\nJudgments\n", "Notices of Correction");
  if (!section) return [];

  const withoutHeader = section.replace("CASE NUMBERTYPESTATUS", "");
  if (toLines(withoutHeader).length === 0) return [];

  const blocks = splitJudgmentBlocks(withoutHeader);
  if (blocks.length > 0) return blocks.map(parseJudgmentBlock);

  warnings.push(
    "Public Information's Judgments table has rows, but none matched the County Court Judgment row layout this parser knows — they were read with a generic keyword scan and should be checked carefully."
  );
  return scanForJudgmentEvents(withoutHeader);
}

// ---------------------------------------------------------------------------
// Searches (current + previous address sections, which repeat per address
// TransUnion has on file rather than appearing once each)
// ---------------------------------------------------------------------------

const SEARCH_PURPOSES = ["Consumer Credit File Request", "Credit Application", "Identity Check for Credit", "Insurance Quotation", "Quotation Search"];
const SEARCH_HEADER_LINE = new RegExp(`^(.*?)(${SEARCH_PURPOSES.map(escapeRegExp).join("|")})(\\d{1,2} [A-Za-z]{3,4} \\d{4})$`);

function parseSearchesSection(rawText: string, warnings: string[]): ParsedEvent[] {
  const section = sliceBetween(rawText, "Searches on your current address", "Address Links");
  if (!section) return [];

  const lines = toLines(section);
  const events: ParsedEvent[] = [];
  let headerLines: string[] = [];
  let current: { date: string; searchedBy: string; purpose?: string } | null = null;

  for (const line of lines) {
    if (/^Input address/.test(line)) {
      const headerText = headerLines.join(" ").trim();
      const m = headerText.match(SEARCH_HEADER_LINE);
      if (m) {
        current = { searchedBy: m[1].trim(), purpose: m[2], date: shortDayMonthYearToIso(m[3]) ?? new Date().toISOString().slice(0, 10) };
      } else {
        // Unknown purpose phrase: still try to pull a trailing date so the
        // event isn't lost, just without a clean searchedBy/purpose split.
        const dateMatch = headerText.match(/(\d{1,2} [A-Za-z]{3,4} \d{4})$/);
        current = { searchedBy: headerText, date: shortDayMonthYearToIso(dateMatch?.[1]) ?? new Date().toISOString().slice(0, 10) };
      }
      headerLines = [];
      continue;
    }
    const appType = line.match(/^Application type(Sole|Joint)$/i);
    if (appType && current) {
      events.push({
        type: "SEARCH",
        date: current.date,
        detail: { searchedBy: current.searchedBy, applicationType: current.purpose, jointApplication: appType[1].toLowerCase() === "joint" },
      });
      current = null;
      continue;
    }
    if (current) continue; // "Search reference" / "Name" / "Date of birth" — not needed
    headerLines.push(line);
  }

  if (events.length === 0) warnings.push("No search history was recognised in the Searches sections.");
  return events;
}

// ---------------------------------------------------------------------------

export function parseTransUnionReport(rawText: string): ParsedReport {
  const report = emptyParsedReport("TRANSUNION");

  parsePersonalInfo(rawText, report);
  parseAddressLinkHistory(rawText, report);

  const accountsText = sliceBetween(rawText, "Financial Account Information", "Searches on your current address");
  if (accountsText) {
    for (const block of splitAccountBlocks(accountsText)) {
      const account = parseAccountBlock(block, report.warnings);
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
    report.warnings.push(
      "TransUnion's month-by-month Status/Balance/Limit/Statement/Payment history grids couldn't be read: the exported PDF has no separators between adjacent months' figures (e.g. nine months' balances run together as one digit string), so splitting them would mean guessing which digits belong to which month. Only each account's overall status, opening balance and default figures (all on their own clearly-labelled lines) were used."
    );
  }

  report.events.push(...parseJudgmentsSection(rawText, report.warnings));
  report.events.push(...parseSearchesSection(rawText, report.warnings));

  if (report.accounts.length === 0) {
    report.warnings.push("No credit accounts were recognised — the file may not be a TransUnion consumer report, or its layout has changed.");
  }

  return report;
}
