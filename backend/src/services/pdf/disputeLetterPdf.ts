import PDFDocument from "pdfkit";
import { DisputeLetterParts } from "../analytics/disputeTextGenerator";

export type EnvelopeSize = "none" | "c5" | "dl";
export type SignatureMode = "digital" | "blank";

export interface DisputeScheduleRow {
  label: string;
  detail: string;
  amount: number | null;
}

/** PDF points per millimetre (72pt/inch ÷ 25.4mm/inch) — pdfkit works in
 * points, but every envelope measurement we researched is in millimetres,
 * so all layout math below is done in mm and converted at the point of
 * drawing. */
const MM = 72 / 25.4;
const PAGE_WIDTH_MM = 210;

interface EnvelopeSpec {
  label: string;
  /** Where the recipient's address must sit so it shows through the
   * envelope's die-cut window once the sheet is folded. */
  addressBoxXmm: number;
  addressBoxYmm: number;
  addressBoxWidthMm: number;
  addressBoxHeightMm: number;
  /** Y positions (mm from the top of the flat A4 sheet) to draw a dashed
   * fold guide. */
  foldLinesMm: number[];
  /** Where the "Dear Sir or Madam," body can safely start without
   * overlapping the address window or the folds above it. */
  bodyStartYmm: number;
  /** Shown only when this envelope's exact window position is a
   * best-available estimate rather than a manufacturer specification —
   * see the C5/DL research notes below. */
  caveat?: string;
  source: string;
}

/**
 * C5 (229×162mm envelope, A4 folded once in half): window position is
 * well corroborated by UK print-industry guidance (checked 2026-09,
 * cavaliermailing.com's window-envelope print guide) as 20mm from the
 * left edge and 60mm from the top of the flat A4 sheet, window ~90×44mm.
 *
 * DL (110×220mm envelope, A4 folded in three): UK suppliers' own specs
 * were inconsistent or unavailable (Royal Mail's guide is blocked by
 * robots.txt; several supplier pages had no usable data). The best
 * available reference (printreadykit.com, citing the German DIN 680
 * convention) gives the window position relative to the *envelope*
 * (20mm from left, 15mm up from the bottom, ~90×45mm) — translating that
 * onto the top panel of a tri-folded A4 sheet, and every source that
 * discusses it, describes it as a starting point that varies by
 * manufacturer by several millimetres, not a specification. Treat the DL
 * figures below as approximate and test-fold before using them for
 * anything time-sensitive.
 */
const ENVELOPE_SPECS: Record<"c5" | "dl", EnvelopeSpec> = {
  c5: {
    label: "C5 window envelope (A4 folded once, in half)",
    addressBoxXmm: 20,
    addressBoxYmm: 60,
    addressBoxWidthMm: 90,
    addressBoxHeightMm: 44,
    foldLinesMm: [148.5],
    bodyStartYmm: 118,
    source: "UK print-supplier window-position guidance, checked 2026-09-19 — well corroborated.",
  },
  dl: {
    label: "DL window envelope (A4 folded twice, in three)",
    addressBoxXmm: 20,
    addressBoxYmm: 45,
    addressBoxWidthMm: 90,
    addressBoxHeightMm: 45,
    foldLinesMm: [99, 198],
    bodyStartYmm: 105,
    caveat:
      "DL window position is an approximation (envelope window placement varies by manufacturer, and no single UK-official spec could be confirmed) — fold a spare sheet and check it against your own envelope before relying on this for a time-sensitive letter.",
    source: "DIN 680 convention as reported by printreadykit.com, checked 2026-09-19 — flagged by that source itself as a starting point, not a specification.",
  },
};

function mm(value: number): number {
  return value * MM;
}

/** The label sits in the LEFT gutter (before the 20mm body margin
 * starts), not the right edge — body text can legitimately run under a
 * fold line (that's normal for a tri-fold letter), but the label itself
 * must never land on top of live text, and the left gutter is the one
 * strip of the page nothing else is drawn in. */
function drawDashedHLine(doc: PDFKit.PDFDocument, yMm: number) {
  doc
    .save()
    .dash(4, { space: 3 })
    .moveTo(mm(8), mm(yMm))
    .lineTo(mm(PAGE_WIDTH_MM - 8), mm(yMm))
    .strokeColor("#9ca3af")
    .lineWidth(0.75)
    .stroke()
    .undash()
    .restore();
  doc
    .fontSize(6.5)
    .fillColor("#9ca3af")
    .text("fold", mm(2), mm(yMm) - 8, { width: mm(16), align: "left", lineBreak: false });
  doc.fillColor("black");
}

/** Renders the closing signature block. `bodyLines` ends with
 * [..., "", "Yours faithfully,", "", "<typed name>"] — everything up to
 * and including "Yours faithfully," is written like any other line, then
 * this takes over for the last two so a "blank" signature mode can leave
 * real room for a wet-ink signature instead of just printing the name. */
function writeBodyWithSignature(doc: PDFKit.PDFDocument, bodyLines: string[], signatureMode: SignatureMode, widthMm?: number) {
  const opts = widthMm !== undefined ? { width: mm(widthMm) } : undefined;
  const closingIndex = bodyLines.lastIndexOf("Yours faithfully,");
  const mainLines = closingIndex === -1 ? bodyLines : bodyLines.slice(0, closingIndex + 1);
  const signedName = closingIndex === -1 ? undefined : bodyLines[bodyLines.length - 1];

  doc.font("Times-Roman").fontSize(11);
  for (const line of mainLines) {
    if (line.trim() === "") doc.moveDown(1);
    else doc.text(line, opts);
  }

  if (signedName === undefined) return;

  if (signatureMode === "blank") {
    doc.moveDown(2.5);
    const lineY = doc.y;
    doc
      .moveTo(doc.x, lineY)
      .lineTo(doc.x + mm(70), lineY)
      .strokeColor("#9ca3af")
      .lineWidth(0.75)
      .stroke();
    doc.fillColor("black");
    doc.moveDown(0.3);
    doc.fontSize(9).fillColor("#6b7280").text("Sign here", opts);
    doc.fillColor("black").fontSize(11);
    doc.moveDown(0.8);
    doc.text(signedName, opts);
  } else {
    doc.moveDown(1.5);
    doc.text(signedName, opts);
    doc.fontSize(8).fillColor("#6b7280");
    doc.text(`Typed digital attestation — ${new Date().toLocaleDateString("en-GB")}. Not a signature or official seal.`, opts);
    doc.fillColor("black").fontSize(11);
  }
}

function writeScheduleTable(doc: PDFKit.PDFDocument, schedule: DisputeScheduleRow[]) {
  doc.addPage();
  doc.x = mm(20);
  doc.y = mm(20);
  doc.font("Helvetica-Bold").fontSize(13).text("Itemised schedule of disputed entries", { width: mm(170) });
  doc.moveDown(0.3);
  doc.font("Helvetica").fontSize(9).fillColor("#6b7280");
  doc.text("Referenced in the letter above — kept here as a single itemised list for whoever processes this correspondence.", { width: mm(170) });
  doc.fillColor("black");
  doc.moveDown(1);

  const colItem = doc.x;
  const colDetail = colItem + mm(80);
  const colAmount = colItem + mm(150);
  const rowWidth = mm(170);

  doc.font("Helvetica-Bold").fontSize(9);
  const headerY = doc.y;
  doc.text("Item", colItem, headerY, { width: mm(78) });
  doc.text("Detail", colDetail, headerY, { width: mm(68) });
  doc.text("Amount", colAmount, headerY, { width: mm(20), align: "right" });
  doc.moveDown(0.5);
  doc
    .moveTo(colItem, doc.y)
    .lineTo(colItem + rowWidth, doc.y)
    .strokeColor("#d1d5db")
    .lineWidth(0.75)
    .stroke();
  doc.moveDown(0.4);

  doc.font("Helvetica").fontSize(9);
  for (const row of schedule) {
    const rowY = doc.y;
    doc.text(row.label, colItem, rowY, { width: mm(78) });
    const labelHeight = doc.heightOfString(row.label, { width: mm(78) });
    doc.text(row.detail, colDetail, rowY, { width: mm(68) });
    const detailHeight = doc.heightOfString(row.detail, { width: mm(68) });
    doc.text(row.amount != null ? `£${row.amount.toLocaleString("en-GB")}` : "—", colAmount, rowY, { width: mm(20), align: "right" });
    doc.y = rowY + Math.max(labelHeight, detailHeight) + mm(3);
  }
}

export function renderDisputeLetterPdf(opts: {
  parts: DisputeLetterParts;
  envelope: EnvelopeSize;
  signatureMode: SignatureMode;
  schedule: DisputeScheduleRow[];
}): PDFKit.PDFDocument {
  const { parts, envelope, signatureMode, schedule } = opts;

  if (envelope === "none") {
    const doc = new PDFDocument({ margin: 72, size: "A4" });
    doc.font("Times-Roman").fontSize(11);
    for (const line of [...parts.senderLines, "", ...parts.recipientLines, "", parts.date, ""]) {
      if (line.trim() === "") doc.moveDown(1);
      else doc.text(line);
    }
    writeBodyWithSignature(doc, parts.bodyLines, signatureMode);
    if (schedule.length > 0) writeScheduleTable(doc, schedule);
    return doc;
  }

  const spec = ENVELOPE_SPECS[envelope];
  const doc = new PDFDocument({ size: "A4", margins: { top: 0, bottom: 0, left: 0, right: 0 } });

  // Sender's return address, small, top-right — kept clear of the fold
  // lines and window below it.
  doc.font("Times-Roman").fontSize(9);
  doc.text(parts.senderLines.join("\n"), mm(130), mm(15), { width: mm(65), align: "left" });

  // Fold guides.
  for (const y of spec.foldLinesMm) drawDashedHLine(doc, y);

  // Recipient address, positioned exactly inside the envelope window.
  doc.font("Times-Roman").fontSize(10.5);
  doc.text(parts.recipientLines.join("\n"), mm(spec.addressBoxXmm), mm(spec.addressBoxYmm), {
    width: mm(spec.addressBoxWidthMm),
    height: mm(spec.addressBoxHeightMm),
  });

  // A faint outline showing the window itself, so it's obvious at a
  // glance whether the address actually fits before printing for real.
  doc
    .save()
    .dash(2, { space: 2 })
    .rect(mm(spec.addressBoxXmm) - 3, mm(spec.addressBoxYmm) - 3, mm(spec.addressBoxWidthMm) + 6, mm(spec.addressBoxHeightMm) + 6)
    .strokeColor("#d1d5db")
    .lineWidth(0.5)
    .stroke()
    .undash()
    .restore();

  // A short provenance line, top-left, capped narrow so it can never
  // reach the sender block in the top-right corner.
  doc.fontSize(7).fillColor("#9ca3af");
  doc.text(spec.label, mm(8), mm(3), { width: mm(115) });
  doc.fillColor("black");

  const windowBottomMm = spec.addressBoxYmm + spec.addressBoxHeightMm;
  if (spec.caveat) {
    // Sits in the gap between the window and the date line below it —
    // measured to fit both without overlapping either.
    doc.fontSize(7).fillColor("#b45309");
    doc.text(spec.caveat, mm(20), mm(windowBottomMm + 1), { width: mm(170) });
    doc.fillColor("black");
  }

  doc.font("Times-Roman").fontSize(10.5).fillColor("black");
  doc.text(parts.date, mm(20), mm(windowBottomMm + 10));

  doc.x = mm(20);
  doc.y = mm(spec.bodyStartYmm);
  writeBodyWithSignature(doc, parts.bodyLines, signatureMode, 170);

  if (schedule.length > 0) writeScheduleTable(doc, schedule);

  return doc;
}
