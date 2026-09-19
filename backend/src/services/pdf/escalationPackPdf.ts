import PDFDocument from "pdfkit";
import { ContactEntry } from "../../data/contacts";
import { DisputeLetterParts } from "../analytics/disputeTextGenerator";
import { DisputeScheduleRow } from "./disputeLetterPdf";

export interface EscalationMilestone {
  label: string;
  date: string | null;
  note: string;
}

export interface EscalationPackInput {
  reportLabel: string;
  templateLabel: string;
  recipient: string;
  sentDate: string;
  status: "SENT" | "RESOLVED" | "NO_RESPONSE";
  deadlinePassed: boolean;
  /** The dispute-record notes the user has logged, if any. */
  notes: string | null;
  /** What the analytics engine actually flagged on this report — the
   * evidentiary basis for the dispute, shown up front so whoever reads
   * the pack (a person at the ICO, or the user's own records) doesn't
   * have to reconstruct it from the letter alone. */
  findingMessages: string[];
  identityCheckMessage: string | null;
  letterParts: DisputeLetterParts;
  schedule: DisputeScheduleRow[];
  milestones: EscalationMilestone[];
  authority: ContactEntry;
}

const MM = 72 / 25.4;
function mm(value: number): number {
  return value * MM;
}
const PAGE_WIDTH_MM = 170; // usable width inside a 20mm margin on A4

function heading(doc: PDFKit.PDFDocument, text: string) {
  doc.font("Helvetica-Bold").fontSize(15).fillColor("black").text(text, { width: mm(PAGE_WIDTH_MM) });
  doc.moveDown(0.6);
}

function subheading(doc: PDFKit.PDFDocument, text: string) {
  doc.font("Helvetica-Bold").fontSize(11).fillColor("black").text(text, { width: mm(PAGE_WIDTH_MM) });
  doc.moveDown(0.3);
}

function body(doc: PDFKit.PDFDocument, text: string) {
  doc.font("Helvetica").fontSize(9.5).fillColor("#1f2937").text(text, { width: mm(PAGE_WIDTH_MM) });
  doc.moveDown(0.5);
}

function bulletList(doc: PDFKit.PDFDocument, items: string[]) {
  doc.font("Helvetica").fontSize(9.5).fillColor("#1f2937");
  for (const item of items) {
    doc.text(`•  ${item}`, { width: mm(PAGE_WIDTH_MM), indent: 0 });
    doc.moveDown(0.25);
  }
  doc.moveDown(0.3);
}

/**
 * Builds a single bundled PDF for escalating a dispute that's gone past
 * its statutory (or advisory) deadline without resolution: a cover page
 * summarising the case and the analytics findings behind it, the
 * original dispute letter text as sent, and a final page with the
 * escalation authority's contact details and the dispute's dated
 * milestones. Meant to be attached to (or printed alongside) whatever
 * the user actually sends to the ICO/FOS/court — it does NOT replace
 * writing to them, and says so on its cover page.
 */
export function renderEscalationPackPdf(input: EscalationPackInput): PDFKit.PDFDocument {
  const doc = new PDFDocument({ size: "A4", margin: mm(20) });

  // --- Cover page --------------------------------------------------
  heading(doc, "Escalation pack");
  doc.font("Helvetica").fontSize(9.5).fillColor("#6b7280");
  doc.text(
    "A summary of this dispute and the findings behind it, for your own records or to attach when you escalate. This pack is " +
      "informational — it is not itself a submission to any regulator, and does not replace writing to them directly.",
    { width: mm(PAGE_WIDTH_MM) }
  );
  doc.fillColor("black");
  doc.moveDown(1);

  subheading(doc, "Case summary");
  bulletList(doc, [
    `Report: ${input.reportLabel}`,
    `Dispute type: ${input.templateLabel}`,
    `Sent to: ${input.recipient}, on ${input.sentDate}`,
    `Current status: ${input.status === "SENT" ? "Sent — awaiting response" : input.status === "RESOLVED" ? "Resolved" : "No response received"}${
      input.deadlinePassed ? " — the response deadline has passed" : ""
    }`,
  ]);

  if (input.identityCheckMessage) {
    subheading(doc, "Identity check");
    body(doc, input.identityCheckMessage);
  }

  if (input.findingMessages.length > 0) {
    subheading(doc, "What this report's analysis flagged");
    bulletList(doc, input.findingMessages);
  }

  if (input.notes) {
    subheading(doc, "Notes you've logged");
    body(doc, input.notes);
  }

  if (input.schedule.length > 0) {
    subheading(doc, "Itemised schedule of disputed entries");
    doc.font("Helvetica").fontSize(9);
    for (const row of input.schedule) {
      doc.text(`${row.label} — ${row.detail}${row.amount != null ? ` — £${row.amount.toLocaleString("en-GB")}` : ""}`, { width: mm(PAGE_WIDTH_MM) });
      doc.moveDown(0.2);
    }
    doc.moveDown(0.3);
  }

  // --- Letter as sent ------------------------------------------------
  doc.addPage();
  subheading(doc, "The letter as sent");
  doc.font("Helvetica").fontSize(8.5).fillColor("#6b7280");
  doc.text("Reproduced here in plain layout for the record — see your own copy or PDF export for the envelope-ready version you actually posted.", {
    width: mm(PAGE_WIDTH_MM),
  });
  doc.fillColor("black");
  doc.moveDown(0.8);

  doc.font("Times-Roman").fontSize(10);
  const letterLines = [
    ...input.letterParts.senderLines,
    "",
    ...input.letterParts.recipientLines,
    "",
    input.letterParts.date,
    "",
    ...input.letterParts.bodyLines,
  ];
  for (const line of letterLines) {
    if (line.trim() === "") doc.moveDown(0.8);
    else doc.text(line, { width: mm(PAGE_WIDTH_MM) });
  }

  // --- Escalation guidance --------------------------------------------
  doc.addPage();
  heading(doc, "Escalation guidance");

  subheading(doc, input.authority.name);
  doc.font("Helvetica").fontSize(9.5).fillColor("#1f2937");
  doc.text(input.authority.role, { width: mm(PAGE_WIDTH_MM) });
  doc.moveDown(0.4);
  doc.font("Helvetica-Bold").fontSize(9.5).text("Address", { width: mm(PAGE_WIDTH_MM) });
  doc.font("Helvetica").text(input.authority.addressLines.join("\n"), { width: mm(PAGE_WIDTH_MM) });
  doc.moveDown(0.3);
  if (input.authority.phone) {
    doc.text(`Phone: ${input.authority.phone}`, { width: mm(PAGE_WIDTH_MM) });
  }
  if (input.authority.email) {
    doc.text(`Email: ${input.authority.email}`, { width: mm(PAGE_WIDTH_MM) });
  }
  doc.moveDown(0.3);
  doc.fontSize(8).fillColor("#6b7280");
  doc.text(`Source checked: ${input.authority.sourceUrl}`, { width: mm(PAGE_WIDTH_MM) });
  if (input.authority.note) {
    doc.fillColor("#b45309");
    doc.moveDown(0.2);
    doc.text(input.authority.note, { width: mm(PAGE_WIDTH_MM) });
  }
  doc.fillColor("black").fontSize(9.5);
  doc.moveDown(1);

  subheading(doc, "Dated milestones");
  for (const milestone of input.milestones) {
    doc.font("Helvetica-Bold").fontSize(9.5).text(`${milestone.date ?? "Date not set"} — ${milestone.label}`, { width: mm(PAGE_WIDTH_MM) });
    doc.font("Helvetica").fontSize(9).fillColor("#1f2937").text(milestone.note, { width: mm(PAGE_WIDTH_MM) });
    doc.fillColor("black");
    doc.moveDown(0.5);
  }

  return doc;
}
