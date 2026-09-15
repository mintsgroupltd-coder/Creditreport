import { parse } from "csv-parse/sync";

export interface CsvAccountRow {
  lender?: string;
  accountType?: string;
  status?: string;
  balance?: string;
  creditLimit?: string;
  defaultDate?: string;
  defaultBalance?: string;
  openedDate?: string;
  [key: string]: string | undefined;
}

/**
 * Parses a CSV export into row objects. This targets the common
 * "export my accounts" CSV shape some budgeting tools and bureau
 * portals produce: one row per account with a header row. Column
 * names are matched case-insensitively and loosely (see
 * services/parsing/csvAccountParser.ts for the header aliasing).
 */
export function parseCsv(buffer: Buffer): Record<string, string>[] {
  return parse(buffer, {
    columns: (header: string[]) => header.map((h) => h.trim()),
    skip_empty_lines: true,
    trim: true,
  });
}
