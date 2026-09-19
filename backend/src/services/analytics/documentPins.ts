import { extractBureauRefs } from "./relatedRefs";

/** Mirrors the AlertType/AlertSeverity enums in schema.prisma — kept as
 * plain string unions here (rather than imported from @prisma/client)
 * for the same reason the rest of the analytics layer does this: the
 * generated Prisma client isn't usable as a type source in every
 * environment this code runs in, so these are hand-kept in sync with
 * the schema instead. */
export type PinSeverity = "INFO" | "WARNING" | "CRITICAL";

const ALERT_TYPE_LABELS: Record<string, string> = {
  DOB_MISMATCH: "Date of birth mismatch",
  NAME_VARIATION: "Name variation",
  MIXED_FILE_RISK: "Possible mixed file",
  DUPLICATE_ACCOUNT: "Possible duplicate account",
  HIGH_UTILISATION: "High utilisation",
  UNSATISFIED_CCJ: "Unsatisfied CCJ",
  ACTIVE_DEFAULT: "Active default",
  SEARCH_VOLUME: "Search volume",
};

export interface DocumentPin {
  id: string;
  alertId: string;
  type: string;
  severity: PinSeverity;
  label: string;
  message: string;
  anchor: string | null;
  /** Character offsets into the report's rawText. Both null when no
   * anchor for this alert could be found in the text at all — shown in
   * the UI as "not located" rather than guessed. */
  startIndex: number | null;
  endIndex: number | null;
}

interface PinAlert {
  id: string;
  type: string;
  severity: string;
  message: string;
  relatedRefs: unknown;
}

interface PinAccount {
  id: string;
  bureauRef: string | null;
  lender: { name: string };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Finds the first occurrence of `anchor` in `text`, preferring a
 * word-boundary match (so a ref like "C1" doesn't match inside "C11")
 * but falling back to a plain substring search — some bureau refs and
 * lender names contain characters `\b` doesn't treat as a boundary, and
 * a slightly looser match beats no pin at all. */
function findAnchor(text: string, anchor: string): { startIndex: number; endIndex: number } | null {
  const trimmed = anchor.trim();
  if (trimmed.length < 2) return null;

  const escaped = escapeRegExp(trimmed);
  const boundaryMatch = text.match(new RegExp(`\\b${escaped}\\b`, "i"));
  if (boundaryMatch && boundaryMatch.index !== undefined) {
    return { startIndex: boundaryMatch.index, endIndex: boundaryMatch.index + boundaryMatch[0].length };
  }

  const plainIndex = text.toLowerCase().indexOf(trimmed.toLowerCase());
  if (plainIndex === -1) return null;
  return { startIndex: plainIndex, endIndex: plainIndex + trimmed.length };
}

/**
 * Builds one pin per alert, anchored to wherever the strongest evidence
 * for that alert actually shows up in the report's extracted text: the
 * bureau's own reference for the related account(s) first (e.g. "C11"),
 * falling back to the related lender's name if no ref matches. An alert
 * with no related account at all (a report-wide finding, like a search
 * volume alert with no single account tied to it) gets a pin with null
 * indexes — still listed, just not locatable in the text.
 */
export function buildDocumentPins(rawText: string, alerts: PinAlert[], accounts: PinAccount[]): DocumentPin[] {
  const accountByRef = new Map<string, PinAccount>();
  for (const a of accounts) if (a.bureauRef) accountByRef.set(a.bureauRef, a);

  return alerts.map((alert) => {
    const refs = extractBureauRefs(alert.relatedRefs);
    const relatedAccounts = refs.map((ref) => accountByRef.get(ref)).filter((a): a is PinAccount => Boolean(a));

    const candidateAnchors: string[] = [
      ...refs,
      ...relatedAccounts.map((a) => a.lender.name),
    ];

    let match: { startIndex: number; endIndex: number } | null = null;
    let usedAnchor: string | null = null;
    for (const candidate of candidateAnchors) {
      match = findAnchor(rawText, candidate);
      if (match) {
        usedAnchor = candidate;
        break;
      }
    }

    return {
      id: `pin-${alert.id}`,
      alertId: alert.id,
      type: alert.type,
      severity: alert.severity as PinSeverity,
      label: ALERT_TYPE_LABELS[alert.type] ?? alert.type,
      message: alert.message,
      anchor: usedAnchor,
      startIndex: match?.startIndex ?? null,
      endIndex: match?.endIndex ?? null,
    };
  });
}
