/**
 * Alert.relatedRefs is a loosely-shaped JSON bag written by different
 * analytics checks ({accountRef}, {eventRef}, {refs: [...]}) — all of
 * them hold bureau reference strings (e.g. "C11"), never DB ids. This
 * pulls out every string value, regardless of which key it was filed
 * under, so callers never need to know the exact shape a given check
 * used. Shared by getReport (to resolve DB account ids for linking) and
 * documentPins.ts (to anchor a finding back into the report's raw text)
 * so the two can never disagree about what a ref actually is.
 */
export function extractBureauRefs(relatedRefs: unknown): string[] {
  if (!relatedRefs || typeof relatedRefs !== "object") return [];
  const values = Object.values(relatedRefs as Record<string, unknown>);
  const refs: string[] = [];
  for (const v of values) {
    if (typeof v === "string") refs.push(v);
    else if (Array.isArray(v)) refs.push(...v.filter((x): x is string => typeof x === "string"));
  }
  return refs;
}
