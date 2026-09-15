/** Shared helpers used by every bureau-specific parser. */

/** "09/05/2023" -> "2023-05-09" (UK day/month/year). Returns undefined if unparseable. */
export function ukDateToIso(text: string | undefined | null): string | undefined {
  if (!text) return undefined;
  const m = text.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return undefined;
  const [, dd, mm, yyyy] = m;
  const day = dd.padStart(2, "0");
  const month = mm.padStart(2, "0");
  // Basic sanity check — reject e.g. 32/13/2020
  const asDate = new Date(`${yyyy}-${month}-${day}T00:00:00Z`);
  if (Number.isNaN(asDate.getTime())) return undefined;
  return `${yyyy}-${month}-${day}`;
}

/** "£3,004" | "3004" | "SETTLED" -> 3004 | undefined */
export function parseMoney(text: string | undefined | null): number | undefined {
  if (!text) return undefined;
  const cleaned = text.replace(/[£,\s]/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return undefined;
  return Number(cleaned);
}

/** Collapses repeated whitespace and trims — pdf-parse output is often ragged. */
export function normalizeWhitespace(text: string): string {
  return text.replace(/[ \t]+/g, " ").replace(/\r/g, "");
}

/** Splits raw extracted text into non-empty, trimmed lines. */
export function toLines(text: string): string[] {
  return normalizeWhitespace(text)
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

/** True if a status/balance token is a currency figure rather than a code letter. */
export function looksLikeMoney(token: string): boolean {
  return /^£?-?[\d,]+(\.\d+)?$/.test(token);
}

/**
 * Classifies an account from its "Current Balance" field, whether it
 * has ever defaulted, and whether that default carries a satisfaction
 * date.
 *
 * The "Current Balance" field is the report's own summary label, and
 * on real Experian exports it isn't always trustworthy on its own: an
 * account can read "Current Balance: SATISFIED" while carrying no
 * Satisfaction Date and a monthly balance history that keeps growing
 * (a live discrepancy we found parsing a real report — see
 * backend/README.md § Parsing engine). So a defaulted account is only
 * ever classified SATISFIED when a satisfaction/settlement date
 * corroborates it; otherwise it stays DEFAULT and the caller should
 * surface a warning, because the label and the underlying data disagree.
 */
export function classifyAccountStatus(
  currentBalanceField: string | undefined,
  hasDefault: boolean,
  hasSatisfactionDate: boolean
): "ACTIVE" | "SETTLED" | "DEFAULT" | "SATISFIED" | "CLOSED" | "UNKNOWN" {
  const label = currentBalanceField?.trim().toUpperCase();

  if (hasDefault) {
    return hasSatisfactionDate ? "SATISFIED" : "DEFAULT";
  }
  if (label === "SETTLED" || label === "SATISFIED") return "SETTLED";
  if (label && looksLikeMoney(label)) return "ACTIVE";
  return "UNKNOWN";
}

/** Normalizes a lender/creditor name for de-duplication across reports and bureaus. */
export function normalizeLenderName(name: string): string {
  return name
    .toUpperCase()
    .replace(/\b(LTD|LIMITED|PLC|LLC|INC|UK|GROUP|SERVICES|CO)\b/g, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}
