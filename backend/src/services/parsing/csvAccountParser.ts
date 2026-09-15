import { ParsedAccount, ParsedEvent, ParsedReport, emptyParsedReport } from "./types";
import { classifyAccountStatus, parseMoney, ukDateToIso } from "./shared";

/**
 * Parses a "one row per account" CSV export. Column names are matched
 * case-insensitively against a few likely aliases rather than one
 * fixed header, since exports from different tools/bureaus name
 * columns differently.
 */
const COLUMN_ALIASES: Record<keyof ColumnMap, string[]> = {
  lender: ["lender", "company", "creditor", "provider"],
  accountType: ["account type", "type", "product"],
  status: ["status", "account status"],
  balance: ["current balance", "balance"],
  creditLimit: ["credit limit", "limit"],
  openedDate: ["started", "opened", "opened date", "date opened"],
  defaultDate: ["default date"],
  defaultBalance: ["default balance"],
  satisfactionDate: ["satisfaction date", "settlement date"],
};

interface ColumnMap {
  lender: string;
  accountType: string;
  status: string;
  balance: string;
  creditLimit: string;
  openedDate: string;
  defaultDate: string;
  defaultBalance: string;
  satisfactionDate: string;
}

function buildColumnMap(headerRow: Record<string, string>): Partial<ColumnMap> {
  const headers = Object.keys(headerRow).map((h) => ({ raw: h, lower: h.trim().toLowerCase() }));
  const map: Partial<ColumnMap> = {};

  (Object.keys(COLUMN_ALIASES) as (keyof ColumnMap)[]).forEach((field) => {
    const aliases = COLUMN_ALIASES[field];
    const match = headers.find((h) => aliases.includes(h.lower));
    if (match) map[field] = match.raw;
  });

  return map;
}

export function parseAccountsCsv(rows: Record<string, string>[]): ParsedReport {
  const report = emptyParsedReport("UNKNOWN");
  if (rows.length === 0) {
    report.warnings.push("The CSV file had no data rows.");
    return report;
  }

  const columnMap = buildColumnMap(rows[0]);
  if (!columnMap.lender) {
    report.warnings.push('Could not find a "Lender"/"Company" column — every row was skipped. Expected headers like Lender, Balance, Default Date.');
    return report;
  }

  const accounts: ParsedAccount[] = [];
  const events: ParsedEvent[] = [];

  for (const row of rows) {
    const lenderName = columnMap.lender ? row[columnMap.lender]?.trim() : undefined;
    if (!lenderName) continue;

    const defaultDate = columnMap.defaultDate ? ukDateToIso(row[columnMap.defaultDate]) : undefined;
    const satisfactionDate = columnMap.satisfactionDate ? ukDateToIso(row[columnMap.satisfactionDate]) : undefined;
    const balanceField = columnMap.balance ? row[columnMap.balance] : undefined;
    const status = classifyAccountStatus(balanceField, Boolean(defaultDate), Boolean(satisfactionDate));
    const defaultBalance = columnMap.defaultBalance ? parseMoney(row[columnMap.defaultBalance]) : undefined;

    accounts.push({
      lenderName,
      accountType: columnMap.accountType ? row[columnMap.accountType]?.trim() || "Unknown" : "Unknown",
      status,
      openedDate: columnMap.openedDate ? ukDateToIso(row[columnMap.openedDate]) : undefined,
      currentBalance: parseMoney(balanceField) ?? (status === "DEFAULT" ? defaultBalance : undefined),
      creditLimit: columnMap.creditLimit ? parseMoney(row[columnMap.creditLimit]) : undefined,
      defaultDate,
      defaultBalance,
      satisfactionDate,
      statusHistory: [],
    });

    if (defaultDate) {
      events.push({ type: "DEFAULT", date: defaultDate, amount: defaultBalance, detail: { lenderName } });
    }
  }

  report.accounts = accounts;
  report.events = events;
  if (accounts.length === 0) {
    report.warnings.push("No usable rows were found in the CSV after column matching.");
  }
  return report;
}
