import { ParsedReport } from "./types";
import { parseGenericReport } from "./genericFallbackParser";

/**
 * Same situation as equifaxParser.ts: TransUnion UK ("Callcredit")
 * reports have their own layout that we haven't validated a parser
 * against, so this delegates to the generic scanner and tags the
 * bureau for the UI. See backend/README.md § Parsing engine for how
 * to upgrade this to a dedicated block parser the way experianParser.ts
 * does, once a real sample is available.
 */
export function parseTransUnionReport(rawText: string): ParsedReport {
  const report = parseGenericReport(rawText);
  report.bureau = "TRANSUNION";
  report.warnings.unshift(
    "Detected as a TransUnion report, but TransUnion doesn't have a dedicated block parser yet — this was read with the generic scanner. Accuracy will be lower than for Experian reports."
  );
  return report;
}
