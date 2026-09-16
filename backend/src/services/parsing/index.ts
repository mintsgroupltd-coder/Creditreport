import { detectBureau } from "./bureauDetector";
import { parseAccountsCsv } from "./csvAccountParser";
import { parseEquifaxReport } from "./equifaxParser";
import { parseExperianReport } from "./experianParser";
import { parseGenericReport } from "./genericFallbackParser";
import { parseTransUnionReport } from "./transunionParser";
import { ParsedReport } from "./types";

export * from "./types";

/**
 * Single entry point the upload route calls: given raw text (already
 * extracted from a PDF, or the joined text of a CSV) and a hint about
 * where it came from, picks the right parser and returns a ParsedReport.
 *
 * PDF text goes through bureau detection -> bureau-specific parser
 * (falling back to the generic scanner for an unrecognised bureau).
 * CSV rows go through the dedicated CSV parser, which doesn't need
 * bureau detection since its column headers self-describe the data.
 */
export function parseReportText(rawText: string): ParsedReport {
  const bureau = detectBureau(rawText);

  switch (bureau) {
    case "EXPERIAN":
      return parseExperianReport(rawText);
    case "EQUIFAX":
      return parseEquifaxReport(rawText);
    case "TRANSUNION":
      return parseTransUnionReport(rawText);
    default:
      return parseGenericReport(rawText);
  }
}

export function parseReportCsv(rows: Record<string, string>[]): ParsedReport {
  return parseAccountsCsv(rows);
}
