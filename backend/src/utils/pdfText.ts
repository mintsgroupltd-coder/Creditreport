import pdfParse from "pdf-parse";

/**
 * Extracts plain text from an uploaded PDF buffer. pdf-parse gives us
 * the text stream per page joined with form-feeds; the parsers work on
 * the joined text and don't care about page boundaries.
 */
export async function extractPdfText(buffer: Buffer): Promise<string> {
  const result = await pdfParse(buffer);
  return result.text;
}
