import {
  AccountStatusName,
  ParsedAccount,
  ParsedEvent,
  ParsedReport,
  ParsedStatusEntry,
  emptyParsedReport,
} from "./types";
import { classifyAccountStatus, parseMoney, toLines, ukDateToIso } from "./shared";

/**
 * Parser for Experian UK's "printable version" consumer report.
 *
 * Every block on this report (a credit account, a court judgment, a
 * search, an electoral roll entry, a linked address) starts with a
 * short reference glued to the front of its first line — "C12", "J1",
 * "P4", "E2", "B7" — with no separating space, e.g.:
 *
 *   C12MR OLA TAYO, 73, ROBINIA AVENUE, ... DA11 9QFDate of Birth:10/10/1971
 *
 * That reference is the reliable anchor: we split the whole document
 * into blocks on lines that *start* with one of those reference
 * patterns, then run a block-type-specific extractor on each block's
 * text. This was built and checked against a real Experian export —
 * see backend/README.md § Parsing engine for what's solid vs best-effort.
 */

// No \b after the digits: the ref is glued directly onto the name that
// follows ("C1MR OLA TAYO...") with no separator, and \b never fires
// between two word characters (a digit and a letter both count), so it
// would silently fail to match every real block header.
const BLOCK_START = /^(C|J|P|E|B)(\d{1,4})(?=[A-Z])/;

interface RawBlock {
  kind: "C" | "J" | "P" | "E" | "B";
  ref: string;
  lines: string[];
}

function splitIntoBlocks(text: string): RawBlock[] {
  const lines = toLines(text);
  const blocks: RawBlock[] = [];
  let current: RawBlock | null = null;

  for (const line of lines) {
    const match = line.match(BLOCK_START);
    if (match) {
      if (current) blocks.push(current);
      current = { kind: match[1] as RawBlock["kind"], ref: `${match[1]}${match[2]}`, lines: [line] };
      continue;
    }
    // A line that starts a brand new report section ends the current block.
    if (/^(Aliases|Financial Associations|Rental Information|Previous Searches|Financial Associate Searches|Linked Addresses|CIFAS|NOTICE OF CORRECTION|Open Banking information|Useful Addresses|Report Generated On:)/i.test(line)) {
      if (current) {
        blocks.push(current);
        current = null;
      }
      continue;
    }
    if (current) current.lines.push(line);
  }
  if (current) blocks.push(current);
  return blocks;
}

/** Strips the leading block ref (e.g. "C12") from a block's first line. */
function stripRef(line: string): string {
  return line.replace(BLOCK_START, "");
}

interface NameAddressDob {
  recordedName?: string;
  linkedAddress?: string;
  recordedDob?: string;
}

/** "MR OLA TAYO, 73, ROBINIA AVENUE, ... DA11 9QFDate of Birth:10/10/1971" -> parts */
function parseNameAddressDob(headerLine: string): NameAddressDob {
  const dobMatch = headerLine.match(/Date of Birth:(\d{2}\/\d{2}\/\d{4})/);
  const withoutDob = headerLine.replace(/Date of Birth:\d{2}\/\d{2}\/\d{4}/, "").trim();

  const commaIndex = withoutDob.indexOf(",");
  if (commaIndex === -1) {
    return { recordedName: withoutDob || undefined, recordedDob: ukDateToIso(dobMatch?.[1]) };
  }

  const namePart = withoutDob.slice(0, commaIndex).trim();
  const addressPart = withoutDob.slice(commaIndex + 1).trim();
  const recordedName = namePart.replace(/^(MR|MRS|MS|MX|MISS|DR)\s+/i, "").trim();

  return {
    recordedName: recordedName || undefined,
    linkedAddress: addressPart || undefined,
    recordedDob: ukDateToIso(dobMatch?.[1]),
  };
}

const DATE_LABELS = ["Started", "Settlement Date", "Default Date", "Satisfaction Date", "Updated To"];
const MONEY_OR_WORD_LABELS = ["Current Balance", "Default Balance", "Credit Limit"];
const TEXT_LABELS = ["Company", "Account Type", "Payment Terms"];
const ACCOUNT_LABELS = [...TEXT_LABELS, ...DATE_LABELS, ...MONEY_OR_WORD_LABELS];

/**
 * Pulls "Label:value" pairs out of a block, tolerant of two labels
 * glued onto one line with no separator (e.g. "Settlement
 * Date:06/09/2022Updated To:09/10/2022").
 *
 * Date and money/word fields use a tight value pattern rather than
 * "everything up to the next label" — the naive version breaks
 * whenever the field is the last one in the block (most often
 * "Updated To" or "Credit Limit"), because with newlines collapsed
 * to spaces there's no next label to stop at, so a lazy `.*?` just
 * swallows the rest of the block (including the status-history
 * table) before hitting end-of-string.
 */
function extractLabels(blockText: string, labels: string[]): Record<string, string> {
  const found: Record<string, string> = {};
  const alternation = labels.join("|");

  for (const label of labels) {
    let re: RegExp;
    if (DATE_LABELS.includes(label)) {
      re = new RegExp(`${label}:\\s*(\\d{1,2}\\/\\d{1,2}\\/\\d{4})`);
    } else if (MONEY_OR_WORD_LABELS.includes(label)) {
      re = new RegExp(`${label}:\\s*(£?-?[\\d,]+(?:\\.\\d+)?|SETTLED|SATISFIED|N\\/A)`);
    } else {
      re = new RegExp(`${label}:\\s*([^\\n]*?)(?=(?:${alternation}):|$)`);
    }
    const m = blockText.match(re);
    if (m && m[1].trim()) found[label] = m[1].trim();
  }
  return found;
}

/**
 * Best-effort extraction of the "Account Status Details: (1 - 12 months)"
 * and "(13 - 24 months)" grids. Status codes are single characters run
 * together (e.g. "[8]8" or "[0]000000000") and balances are £-prefixed
 * numbers run together (e.g. "£394£394", "£-221"), so both split cleanly
 * on their own markers. Month N's date is derived by counting back from
 * "Updated To". The 25+ month blocks are older, coarser history — we
 * record them as a raw note (see `warnings`) rather than expanding them,
 * since Experian doesn't print exact per-slot dates for them either.
 */
function extractStatusHistory(blockText: string, updatedToIso: string | undefined): ParsedStatusEntry[] {
  const entries: ParsedStatusEntry[] = [];
  if (!updatedToIso) return entries;

  const segments = blockText.matchAll(
    /Account Status Details:\s*\(1 - 12 months\)\s*Status Code:\s*\[(.)\]([0-9DU?]*)\s*Balance:\s*((?:-?£-?[\d,]+(?:\.\d+)?)*)/g
  );

  for (const seg of segments) {
    const [, currentCode, restCodes, balanceRun] = seg;
    const codes = [currentCode, ...restCodes.split("")];
    const balances = [...balanceRun.matchAll(/-?£-?[\d,]+(?:\.\d+)?/g)].map((m) => parseMoney(m[0]));

    const base = new Date(`${updatedToIso}T00:00:00Z`);
    codes.forEach((code, i) => {
      const period = new Date(base);
      period.setUTCMonth(period.getUTCMonth() - i);
      entries.push({
        periodDate: period.toISOString().slice(0, 10),
        statusCode: code,
        balance: balances[i],
      });
    });
  }

  return entries;
}

function parseAccountBlock(block: RawBlock, warnings: string[]): ParsedAccount | null {
  const headerLine = stripRef(block.lines[0]);
  const { recordedName, linkedAddress, recordedDob } = parseNameAddressDob(headerLine);
  const blockText = block.lines.join(" ");
  const labels = extractLabels(blockText, ACCOUNT_LABELS);

  if (!labels["Company"]) {
    warnings.push(`Could not find a lender name in block ${block.ref} — skipped.`);
    return null;
  }

  const defaultDate = ukDateToIso(labels["Default Date"]);
  const currentBalanceField = labels["Current Balance"];
  const satisfactionDate = ukDateToIso(labels["Satisfaction Date"]) ?? ukDateToIso(labels["Settlement Date"]);
  const status: AccountStatusName = classifyAccountStatus(currentBalanceField, Boolean(defaultDate), Boolean(satisfactionDate));

  if (defaultDate && !satisfactionDate && /^(SETTLED|SATISFIED)$/i.test(currentBalanceField ?? "")) {
    warnings.push(
      `${block.ref}: "Current Balance" says ${currentBalanceField} but there's no Satisfaction/Settlement Date — treated as still in default rather than resolved. Verify with the lender.`
    );
  }

  const updatedToIso = ukDateToIso(labels["Updated To"]);
  const statusHistory = extractStatusHistory(blockText, updatedToIso);
  if (/Account Status Codes \(25\+ months\)/.test(blockText)) {
    warnings.push(`${block.ref}: has 25+ months of history not expanded into the timeline (see parser notes).`);
  }

  const defaultBalance = parseMoney(labels["Default Balance"]);
  // "Current Balance" is sometimes a word (SATISFIED/SETTLED) rather than
  // a figure. For a still-defaulted account that's most recent known
  // default balance, not £0 — falling back to £0 here would make an
  // unresolved debt disappear from any balance total.
  const numericCurrentBalance = parseMoney(currentBalanceField);
  const currentBalance =
    status === "ACTIVE" || status === "DEFAULT"
      ? numericCurrentBalance ?? (status === "DEFAULT" ? defaultBalance : undefined)
      : parseMoney("0");

  return {
    bureauRef: block.ref,
    lenderName: labels["Company"],
    accountType: labels["Account Type"] ?? "Unknown",
    status,
    openedDate: ukDateToIso(labels["Started"]),
    currentBalance,
    creditLimit: parseMoney(labels["Credit Limit"]),
    defaultDate,
    defaultBalance,
    satisfactionDate,
    linkedAddress,
    recordedName,
    recordedDob,
    statusHistory,
  };
}

function parseJudgmentBlock(block: RawBlock): ParsedEvent {
  const blockText = block.lines.join(" ");
  const informationType = blockText.match(/Information Type:\s*([A-Z ]+?)(?:Court Name:|$)/)?.[1]?.trim();
  const courtName = blockText.match(/Court Name:\s*(.+?)(?:Date:|$)/)?.[1]?.trim();
  const date = blockText.match(/(?<!Satisfied )Date:\s*(\d{2}\/\d{2}\/\d{4})/)?.[1];
  const satisfiedDate = blockText.match(/Satisfied Date:\s*(\d{2}\/\d{2}\/\d{4})/)?.[1];
  const amount = blockText.match(/Amount:\s*£?([\d,]+)/)?.[1];
  const caseNumber = blockText.match(/Case Number:\s*([A-Z0-9]+)/)?.[1];
  // Stops before the first lowercase word (the boilerplate sentence that
  // follows "Source:" in the same block, e.g. "...LTD If you have paid...").
  const source = blockText.match(/Source:\s*([A-Z][A-Z0-9. ]*?)(?=\s[A-Z][a-z]|$)/)?.[1]?.trim();
  const { recordedName } = parseNameAddressDob(stripRef(block.lines[0]));

  return {
    type: "CCJ",
    date: ukDateToIso(date) ?? new Date().toISOString().slice(0, 10),
    amount: parseMoney(amount),
    accountRef: block.ref,
    detail: {
      informationType,
      courtName,
      caseNumber,
      source,
      satisfiedDate: ukDateToIso(satisfiedDate),
      recordedName,
      isSatisfied: /SATISFIED/i.test(informationType ?? ""),
    },
  };
}

function parseSearchBlock(block: RawBlock): ParsedEvent {
  const blockText = block.lines.join(" ");
  const searchedBy = blockText.match(/Searched by:\s*(.+?)(?:Searched on:|$)/)?.[1]?.trim();
  const searchedOn = blockText.match(/Searched on:\s*(\d{2}\/\d{2}\/\d{4})/)?.[1];
  const applicationType = blockText.match(/Application Type:\s*(.+?)$/)?.[1]?.trim();
  const { recordedName, recordedDob } = parseNameAddressDob(stripRef(block.lines[0]));

  return {
    type: "SEARCH",
    date: ukDateToIso(searchedOn) ?? new Date().toISOString().slice(0, 10),
    accountRef: block.ref,
    detail: { searchedBy, applicationType, recordedName, recordedDob },
  };
}

function parseElectoralRollBlock(block: RawBlock): ParsedEvent | null {
  const blockText = block.lines.join(" ");
  const range = blockText.match(/From (\d{2}\/\d{4}) to (\d{2}\/\d{4})/);
  if (!range) return null;
  const [, fromMY, toMY] = range;
  const [fm, fy] = fromMY.split("/");
  return {
    type: "ELECTORAL_ROLL",
    date: `${fy}-${fm}-01`,
    accountRef: block.ref,
    detail: { from: fromMY, to: toMY, raw: blockText },
  };
}

function parseLinkedAddressBlock(block: RawBlock): ParsedEvent {
  const blockText = block.lines.join(" ");
  const linkedTo = blockText.match(/Linked to:\s*(.+?)(?:Source:|$)/)?.[1]?.trim();
  const source = blockText.match(/Source:\s*(.+?)(?:Date of Information:|$)/)?.[1]?.trim();
  const date = blockText.match(/Date of Information:\s*(\d{2}\/\d{2}\/\d{4})/)?.[1];
  return {
    type: "LINKED_ADDRESS",
    date: ukDateToIso(date) ?? new Date().toISOString().slice(0, 10),
    accountRef: block.ref,
    detail: { linkedTo, source },
  };
}

function parseApplicantDetails(text: string): { name?: string; dob?: string; addresses: string[] } {
  const section = text.slice(0, text.indexOf("Electoral Roll Information") > -1 ? text.indexOf("Electoral Roll Information") : 1200);
  const nameDobMatch = section.match(/(MR|MRS|MS|MX|MISS|DR)\s+([A-Z ]+?)\s*Date of Birth:\s*(\d{2}\/\d{2}\/\d{4})/);
  const present = section.match(/Present Address:\s*([^\n]+)/)?.[1]?.trim();
  const otherBlockMatch = section.match(/Other Addresses:\s*([\s\S]+?)(?:Electoral Roll|$)/);
  const others = otherBlockMatch
    ? otherBlockMatch[1]
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
    : [];

  return {
    name: nameDobMatch ? nameDobMatch[2].trim() : undefined,
    dob: ukDateToIso(nameDobMatch?.[3]),
    addresses: [present, ...others].filter((a): a is string => Boolean(a)),
  };
}

export function parseExperianReport(rawText: string): ParsedReport {
  const report = emptyParsedReport("EXPERIAN");

  const applicant = parseApplicantDetails(rawText);
  report.applicantName = applicant.name;
  report.dateOfBirth = applicant.dob;
  report.addresses = applicant.addresses.map((line) => ({ line, source: "Application Details" }));

  const blocks = splitIntoBlocks(rawText);

  for (const block of blocks) {
    switch (block.kind) {
      case "C": {
        const account = parseAccountBlock(block, report.warnings);
        if (account) {
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
        break;
      }
      case "J":
        report.events.push(parseJudgmentBlock(block));
        break;
      case "P":
        report.events.push(parseSearchBlock(block));
        break;
      case "E": {
        const ev = parseElectoralRollBlock(block);
        if (ev) report.events.push(ev);
        break;
      }
      case "B":
        report.events.push(parseLinkedAddressBlock(block));
        break;
    }
  }

  if (report.accounts.length === 0) {
    report.warnings.push("No credit accounts were recognised — the file may not be an Experian consumer report, or its layout has changed.");
  }

  return report;
}
