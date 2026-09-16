import { ParsedReport } from "./types";
import { parseGenericReport } from "./genericFallbackParser";

/**
 * Equifax UK consumer reports use a different layout to Experian's
 * (no glued block-reference prefixes, different section names), and
 * we haven't parsed a real one to check assumptions against — the
 * Experian parser only exists in its current form because we tested
 * it against a real export (see backend/README.md § Parsing engine).
 *
 * Rather than ship regexes built on guesses, this runs the same
 * keyword/pattern scanner used for unrecognised formats and tags the
 * result as Equifax so the UI can show the right "review before
 * trusting this" messaging. Swap this out for a dedicated block
 * parser (mirroring experianParser.ts's approach) once you have a
 * real sample report to build and test against.
 */
export function parseEquifaxReport(rawText: string): ParsedReport {
  const report = parseGenericReport(rawText);
  report.bureau = "EQUIFAX";
  report.warnings.unshift(
    "Detected as an Equifax report, but Equifax doesn't have a dedicated block parser yet — this was read with the generic scanner. Accuracy will be lower than for Experian reports."
  );
  return report;
}
