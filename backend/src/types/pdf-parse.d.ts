// pdf-parse@1.x ships no type declarations. This is the slice of its
// API this project actually uses.
declare module "pdf-parse" {
  interface PdfParseResult {
    text: string;
    numpages: number;
    numrender: number;
    info: Record<string, unknown>;
    metadata: unknown;
    version: string;
  }

  function pdfParse(buffer: Buffer | Uint8Array, options?: Record<string, unknown>): Promise<PdfParseResult>;

  export = pdfParse;
}
