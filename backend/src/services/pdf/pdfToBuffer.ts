/**
 * Every PDF builder in this app (disputeLetterPdf, escalationPackPdf,
 * trackingSheetPdf) returns a PDFKit document meant to be `.pipe()`d
 * straight to an HTTP response. Emailing a letter or bundling one into a
 * zip needs the same PDF as an in-memory Buffer instead — this collects
 * the document's own output stream into one rather than duplicating any
 * of those builders' layout code.
 */
export function pdfDocToBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}
