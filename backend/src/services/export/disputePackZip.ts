import JSZip from "jszip";

export interface DisputePackZipInput {
  letterPdf: Buffer;
  /** Only present when this dispute's template actually has an ICO/FOS
   * escalation route (see escalationAuthorityFor in disputes.controller.ts)
   * — null for a CCJ dispute, which has none. */
  escalationPdf: Buffer | null;
  trackingSheetPdf: Buffer;
  readme: string;
}

/**
 * Bundles the same three PDFs a dispute's individual download buttons
 * already produce into a single zip, so a user who wants "the whole pack"
 * for one dispute doesn't have to click three separate buttons. Purely a
 * packaging step — every PDF is built exactly the way the standalone
 * endpoints already build it (see disputes.controller.ts's
 * getDisputePackZip, which calls the same building blocks those endpoints
 * use); this function never re-derives or duplicates their content.
 */
export async function buildDisputePackZip(input: DisputePackZipInput): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("dispute-letter.pdf", input.letterPdf);
  if (input.escalationPdf) zip.file("escalation-pack.pdf", input.escalationPdf);
  zip.file("postage-tracking-sheet.pdf", input.trackingSheetPdf);
  zip.file("README.txt", input.readme);
  return zip.generateAsync({ type: "nodebuffer" });
}
