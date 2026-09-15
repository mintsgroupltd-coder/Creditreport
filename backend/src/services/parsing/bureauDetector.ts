import { BureauName } from "./types";

/**
 * Bureau reports don't self-identify in a structured way, so detection
 * is just "which bureau's wordmark/boilerplate phrases show up". This
 * is intentionally simple and easy to extend — add a phrase, not a parser.
 */
export function detectBureau(rawText: string): BureauName {
  const text = rawText.toUpperCase();

  if (text.includes("EXPERIAN")) return "EXPERIAN";
  if (text.includes("EQUIFAX")) return "EQUIFAX";
  if (text.includes("TRANSUNION") || text.includes("CALLCREDIT")) return "TRANSUNION";

  return "UNKNOWN";
}
