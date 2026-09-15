import { ParsedAccount, ParsedEvent, ParsedReport, emptyParsedReport } from "./types";
import { parseMoney, toLines, ukDateToIso } from "./shared";

/**
 * Keyword/pattern scanner used for:
 *  - Equifax and TransUnion reports (we don't have a sample layout to
 *    build a dedicated block parser against yet — see backend/README.md),
 *  - anything the bureau detector couldn't identify,
 *  - pasted free text that doesn't match a known block structure.
 *
 * This is deliberately conservative: it finds *candidate* negative
 * items and account-shaped lines by keyword and nearby date/amount,
 * rather than trusting a column layout it hasn't seen. Expect lower
 * recall than the Experian parser, and expect to hand-correct results
 * in the review screen after upload — the UI is built around that
 * being normal, not a bug.
 */

const DATE_RE = /\b(\d{1,2}\/\d{1,2}\/\d{2,4})\b/;
const MONEY_RE = /£\s?-?[\d,]+(?:\.\d+)?/;

const DEFAULT_KEYWORDS = /\b(default|defaulted)\b/i;
const ARREARS_KEYWORDS = /\barrears\b/i;
const CCJ_KEYWORDS = /\b(ccj|county court judgment|judgement|judgment)\b/i;
const SATISFIED_KEYWORDS = /\b(satisfied|settled|discharged|paid in full)\b/i;
const SEARCH_KEYWORDS = /\b(search|enquiry|inquiry|application)\b/i;

function normalizeYear(dateStr: string): string {
  // "12/4/22" -> "12/04/2022" so ukDateToIso's strict YYYY matcher works.
  const [d, m, y] = dateStr.split("/");
  const yyyy = y.length === 2 ? `20${y}` : y;
  return `${d.padStart(2, "0")}/${m.padStart(2, "0")}/${yyyy}`;
}

export function parseGenericReport(rawText: string): ParsedReport {
  const report = emptyParsedReport("UNKNOWN");
  report.warnings.push(
    "This report wasn't recognised as an Experian-formatted export, so it was read with the generic scanner. Please check the extracted accounts and events carefully — recall is lower than the Experian parser."
  );

  const dobMatch = rawText.match(/(?:date of birth|dob)[:\s]*(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
  if (dobMatch) report.dateOfBirth = ukDateToIso(normalizeYear(dobMatch[1]));

  const nameMatch = rawText.match(/\b(MR|MRS|MS|MX|MISS|DR)\s+([A-Z][A-Z .'-]{2,40})\b/);
  if (nameMatch) report.applicantName = nameMatch[2].trim();

  const lines = toLines(rawText);
  const accountsByLender = new Map<string, ParsedAccount>();

  for (const line of lines) {
    const dateOnLine = line.match(DATE_RE)?.[1];
    const amountOnLine = line.match(MONEY_RE)?.[0];
    const iso = dateOnLine ? ukDateToIso(normalizeYear(dateOnLine)) : undefined;

    let event: ParsedEvent | null = null;
    if (CCJ_KEYWORDS.test(line)) {
      event = { type: "CCJ", date: iso ?? new Date().toISOString().slice(0, 10), amount: parseMoney(amountOnLine), detail: { sourceLine: line } };
    } else if (DEFAULT_KEYWORDS.test(line)) {
      event = { type: "DEFAULT", date: iso ?? new Date().toISOString().slice(0, 10), amount: parseMoney(amountOnLine), detail: { sourceLine: line, isSatisfied: SATISFIED_KEYWORDS.test(line) } };
    } else if (ARREARS_KEYWORDS.test(line)) {
      event = { type: "ARREARS", date: iso ?? new Date().toISOString().slice(0, 10), amount: parseMoney(amountOnLine), detail: { sourceLine: line } };
    } else if (SEARCH_KEYWORDS.test(line) && iso) {
      event = { type: "SEARCH", date: iso, detail: { sourceLine: line } };
    }
    if (event) report.events.push(event);

    // A "shaped" account line: a lender-looking name followed later on
    // the same line by a date and a money figure — good enough to seed
    // a row for the user to confirm/edit, not to trust blindly.
    const shaped = line.match(/^([A-Z][A-Za-z0-9&.,'()\- ]{2,60}?)\s+.*(£\s?-?[\d,]+(?:\.\d+)?)/);
    if (shaped && dateOnLine) {
      const lenderName = shaped[1].trim();
      if (!accountsByLender.has(lenderName)) {
        accountsByLender.set(lenderName, {
          lenderName,
          accountType: "Unknown",
          status: DEFAULT_KEYWORDS.test(line) ? "DEFAULT" : "UNKNOWN",
          currentBalance: parseMoney(shaped[2]),
          defaultDate: DEFAULT_KEYWORDS.test(line) ? iso : undefined,
          statusHistory: [],
        });
      }
    }
  }

  report.accounts = [...accountsByLender.values()];
  if (report.accounts.length === 0) {
    report.warnings.push("No account-shaped lines were found. Consider using 'Paste text' with the account section copied in manually, or edit accounts in after upload.");
  }
  return report;
}
