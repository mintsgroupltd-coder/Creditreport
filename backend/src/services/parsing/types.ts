/**
 * The shape every bureau-specific parser normalizes into. Nothing
 * downstream (persistence, analytics) knows which bureau produced the
 * data — it only ever sees a ParsedReport.
 */

export type BureauName = "EXPERIAN" | "EQUIFAX" | "TRANSUNION" | "UNKNOWN";

export type AccountStatusName =
  | "ACTIVE"
  | "SETTLED"
  | "DEFAULT"
  | "SATISFIED"
  | "CLOSED"
  | "UNKNOWN";

export type EventTypeName =
  | "DEFAULT"
  | "ARREARS"
  | "CCJ"
  | "SEARCH"
  | "ELECTORAL_ROLL"
  | "LINKED_ADDRESS";

export interface ParsedAddress {
  line: string;
  from?: string;
  to?: string;
  source?: string;
}

export interface ParsedStatusEntry {
  /** ISO date for the first of the month this status/balance applies to. */
  periodDate: string;
  statusCode: string;
  balance?: number;
}

export interface ParsedAccount {
  /** The bureau's own short reference for this block, e.g. "C12", if present. */
  bureauRef?: string;
  lenderName: string;
  accountType: string;
  status: AccountStatusName;
  openedDate?: string;
  currentBalance?: number;
  creditLimit?: number;
  defaultDate?: string;
  defaultBalance?: number;
  satisfactionDate?: string;
  /** The address this account block was recorded against, if it differs by block. */
  linkedAddress?: string;
  /** Name/DOB exactly as printed on this account's block header — used for mismatch detection. */
  recordedName?: string;
  recordedDob?: string;
  statusHistory: ParsedStatusEntry[];
}

export interface ParsedEvent {
  type: EventTypeName;
  date: string;
  amount?: number;
  accountRef?: string;
  detail?: Record<string, unknown>;
}

export interface ParsedReport {
  bureau: BureauName;
  applicantName?: string;
  dateOfBirth?: string;
  addresses: ParsedAddress[];
  accounts: ParsedAccount[];
  events: ParsedEvent[];
  /** Parsers append anything they couldn't confidently extract, surfaced to the user. */
  warnings: string[];
}

export function emptyParsedReport(bureau: BureauName): ParsedReport {
  return { bureau, addresses: [], accounts: [], events: [], warnings: [] };
}
