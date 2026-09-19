import PDFDocument from "pdfkit";

const MM = 72 / 25.4;
function mm(value: number): number {
  return value * MM;
}

export interface TrackingMilestone {
  label: string;
  date: string | null;
  note: string;
}

export interface TrackingSheetInput {
  recipient: string;
  templateLabel: string;
  sentDate: string;
  service?: string;
  cost?: string;
  reportLabel?: string;
  milestones: TrackingMilestone[];
}

/**
 * A plain, unbranded record of postage for one dispute letter — date,
 * service, cost, and a blank box to note the counter reference — plus
 * the statutory/advisory milestone tracker computed from when it was
 * sent. Deliberately generic: no Post Office/Royal Mail names, logos,
 * "proof of posting" certificate styling, or barcode graphics — the app
 * doesn't reproduce an official document, it just gives you a place to
 * keep your own notes (and your real receipt from the counter)
 * alongside the dispute-tracking dates that matter.
 */
export function renderTrackingSheetPdf(input: TrackingSheetInput): PDFKit.PDFDocument {
  const doc = new PDFDocument({ margin: 72, size: "A4" });

  doc.font("Helvetica-Bold").fontSize(16).text("Postage record");
  doc.font("Helvetica").fontSize(9).fillColor("#6b7280");
  doc.text("A place to keep your own notes on how this letter was sent — not an official receipt. Keep the proof of posting you're given at the counter with this sheet.");
  doc.fillColor("black");
  doc.moveDown(1.2);

  doc.font("Helvetica-Bold").fontSize(11).text("What was sent");
  doc.moveDown(0.3);
  doc.font("Helvetica").fontSize(10);
  const details: [string, string][] = [
    ["Letter", input.templateLabel],
    ["Sent to", input.recipient],
    ...(input.reportLabel ? ([["Report", input.reportLabel]] as [string, string][]) : []),
    ["Date sent", input.sentDate],
  ];
  for (const [label, value] of details) {
    doc.font("Helvetica-Bold").text(`${label}: `, { continued: true }).font("Helvetica").text(value);
  }
  doc.moveDown(1);

  doc.font("Helvetica-Bold").fontSize(11).text("Postage details");
  doc.moveDown(0.4);
  doc.font("Helvetica").fontSize(10);

  function fillableLine(label: string, value: string | undefined) {
    const y = doc.y;
    doc.font("Helvetica-Bold").text(`${label}:`, mm(20), y, { width: mm(45) });
    if (value && value.trim()) {
      doc.font("Helvetica").text(value.trim(), mm(68), y, { width: mm(100) });
    } else {
      doc
        .moveTo(mm(68), y + 11)
        .lineTo(mm(160), y + 11)
        .strokeColor("#9ca3af")
        .lineWidth(0.75)
        .stroke();
      doc.fillColor("black");
    }
    doc.y = y + 20;
  }

  fillableLine("Postal service used", input.service);
  fillableLine("Cost", input.cost);
  fillableLine("Counter reference / barcode no.", undefined);

  doc.moveDown(0.5);
  const boxY = doc.y;
  const boxHeight = mm(28);
  doc
    .rect(mm(20), boxY, mm(170), boxHeight)
    .strokeColor("#d1d5db")
    .lineWidth(0.75)
    .stroke();
  doc.fontSize(8).fillColor("#6b7280");
  doc.text("Attach or staple your counter proof-of-posting receipt here.", mm(24), boxY + 6, { width: mm(160) });
  doc.fillColor("black");
  doc.y = boxY + boxHeight + mm(10);

  doc.font("Helvetica-Bold").fontSize(11).text("Milestone tracker", mm(20), doc.y);
  doc.moveDown(0.4);
  doc.font("Helvetica").fontSize(9).fillColor("#6b7280");
  doc.text(
    "Dates below follow from when this was sent and the deadline that applies to this letter type — see the app for the detailed legal basis of each one.",
    mm(20),
    doc.y,
    { width: mm(170) }
  );
  doc.fillColor("black");
  doc.moveDown(0.6);

  const colDate = mm(20);
  const colMilestone = mm(55);
  const colNote = mm(115);

  doc.font("Helvetica-Bold").fontSize(9);
  const headerY = doc.y;
  doc.text("Date", colDate, headerY, { width: mm(32) });
  doc.text("Milestone", colMilestone, headerY, { width: mm(58) });
  doc.text("Note", colNote, headerY, { width: mm(75) });
  doc.moveDown(0.5);
  doc
    .moveTo(mm(20), doc.y)
    .lineTo(mm(190), doc.y)
    .strokeColor("#d1d5db")
    .lineWidth(0.75)
    .stroke();
  doc.moveDown(0.4);

  doc.font("Helvetica").fontSize(9);
  for (const m of input.milestones) {
    const rowY = doc.y;
    doc.text(m.date ?? "—", colDate, rowY, { width: mm(32) });
    doc.text(m.label, colMilestone, rowY, { width: mm(58) });
    const noteHeight = doc.heightOfString(m.note, { width: mm(75) });
    const milestoneHeight = doc.heightOfString(m.label, { width: mm(58) });
    doc.text(m.note, colNote, rowY, { width: mm(75) });
    doc.y = rowY + Math.max(noteHeight, milestoneHeight) + mm(4);
  }

  return doc;
}
