import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { DocumentPin, InspectorResponse } from "../api/types";
import { AppShell } from "../components/AppShell";

const SEVERITY_STYLES: Record<string, { dot: string; mark: string; activeMark: string }> = {
  INFO: { dot: "bg-slate-400", mark: "bg-slate-400/25", activeMark: "bg-slate-400/60" },
  WARNING: { dot: "bg-warn", mark: "bg-warn/25", activeMark: "bg-warn/60" },
  CRITICAL: { dot: "bg-critical", mark: "bg-critical/25", activeMark: "bg-critical/60" },
};

/** Splits rawText into an alternating array of plain strings and pin
 * objects, in text order, so the render pass below can just walk the
 * array once. Overlapping pins (shouldn't normally happen — each pin
 * comes from a different alert's own anchor) are resolved by keeping
 * whichever started first and skipping anything that would overlap it,
 * rather than producing overlapping <mark> tags. */
function splitTextByPins(text: string, pins: DocumentPin[]): { text: string; pin?: DocumentPin }[] {
  const located = pins
    .filter((p): p is DocumentPin & { startIndex: number; endIndex: number } => p.startIndex !== null && p.endIndex !== null)
    .sort((a, b) => a.startIndex - b.startIndex);

  const segments: { text: string; pin?: DocumentPin }[] = [];
  let cursor = 0;
  for (const pin of located) {
    if (pin.startIndex < cursor) continue; // overlaps the previous pin — skip rather than corrupt the split
    if (pin.startIndex > cursor) segments.push({ text: text.slice(cursor, pin.startIndex) });
    segments.push({ text: text.slice(pin.startIndex, pin.endIndex), pin });
    cursor = pin.endIndex;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor) });
  return segments;
}

export function ReportInspectorPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<InspectorResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activePinId, setActivePinId] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api
      .getReportInspector(id)
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load the document inspector for this report."));
  }, [id]);

  const segments = useMemo(() => (data ? splitTextByPins(data.rawText, data.pins) : []), [data]);
  const locatedPins = data?.pins.filter((p) => p.startIndex !== null) ?? [];
  const unlocatedPins = data?.pins.filter((p) => p.startIndex === null) ?? [];

  function scrollToPin(pinId: string) {
    setActivePinId(pinId);
    document.getElementById(pinId)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  if (error) {
    return (
      <AppShell>
        <p className="text-sm text-critical">{error}</p>
      </AppShell>
    );
  }
  if (!data) {
    return (
      <AppShell>
        <p className="text-sm text-slate-400">Loading…</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">Document inspector</h1>
          <p className="mt-1 text-sm text-slate-400">
            Each finding, pinned to where it actually appears in this report's text.{" "}
            <Link to={`/reports/${id}`} className="text-accent hover:underline">
              ← Back to report
            </Link>
          </p>
        </div>
      </div>

      <p className="mt-4 rounded-lg border border-border bg-panel px-4 py-3 text-xs text-slate-400">
        This shows the text extracted from your uploaded {data.sourceFileType === "pdf" ? "PDF" : "CSV"} at upload time — not a rendered
        image of the original document's page layout, since the app doesn't keep the original file. Each pin is matched to its account's
        bureau reference (or, failing that, the lender's name) inside that text; a finding that couldn't be matched to any text is listed
        below as "not located" rather than guessed at.
      </p>

      <div className="mt-6 grid gap-4 lg:grid-cols-[280px_1fr]">
        <aside className="flex flex-col gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Findings ({data.pins.length})
          </h2>
          {locatedPins.length === 0 && unlocatedPins.length === 0 && <p className="text-sm text-slate-500">No alerts on this report.</p>}
          {locatedPins.map((pin) => {
            const styles = SEVERITY_STYLES[pin.severity] ?? SEVERITY_STYLES.INFO;
            return (
              <button
                key={pin.id}
                onClick={() => scrollToPin(pin.id)}
                className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-left text-xs ${
                  activePinId === pin.id ? "border-accent bg-accent/10" : "border-border bg-panel hover:border-accent"
                }`}
              >
                <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${styles.dot}`} />
                <span>
                  <span className="block font-semibold text-slate-200">{pin.label}</span>
                  <span className="text-slate-400">{pin.message}</span>
                </span>
              </button>
            );
          })}
          {unlocatedPins.length > 0 && (
            <div className="mt-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Not located in this text</h3>
              <div className="mt-2 flex flex-col gap-2">
                {unlocatedPins.map((pin) => {
                  const styles = SEVERITY_STYLES[pin.severity] ?? SEVERITY_STYLES.INFO;
                  return (
                    <div key={pin.id} className="flex items-start gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-xs opacity-70">
                      <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${styles.dot}`} />
                      <span>
                        <span className="block font-semibold text-slate-200">{pin.label}</span>
                        <span className="text-slate-400">{pin.message}</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </aside>

        <div className="max-h-[70vh] overflow-y-auto rounded-lg border border-border bg-panel p-4">
          <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-slate-300">
            {segments.map((seg, i) => {
              if (!seg.pin) return <span key={i}>{seg.text}</span>;
              const styles = SEVERITY_STYLES[seg.pin.severity] ?? SEVERITY_STYLES.INFO;
              return (
                <mark
                  key={i}
                  id={seg.pin.id}
                  title={seg.pin.message}
                  onMouseEnter={() => setActivePinId(seg.pin!.id)}
                  className={`cursor-default rounded px-0.5 text-slate-100 ${activePinId === seg.pin.id ? styles.activeMark : styles.mark}`}
                >
                  {seg.text}
                </mark>
              );
            })}
          </pre>
        </div>
      </div>
    </AppShell>
  );
}
