import { getFreeFinanceClient } from "./index";

/**
 * The contract the E-Mail-Vorlagen module consumes: a finalized document PDF as
 * an attachment. PDFs are fetched on demand and never stored in Postgres.
 */
export interface DocumentAttachment {
  filename: string; // e.g. "Angebot_A.2026T002.pdf"
  contentType: string; // "application/pdf"
  bytes: Uint8Array;
}

const kindLabel = (kind: "offer" | "invoice") => (kind === "offer" ? "Angebot" : "Rechnung");

function sanitize(part: string): string {
  return part.replace(/[^\w.\-]+/g, "_");
}

/** Build the download/attachment filename from the document number. */
export function documentFilename(kind: "offer" | "invoice", number?: string | null): string {
  const suffix = number ? `_${sanitize(number)}` : "";
  return `${kindLabel(kind)}${suffix}.pdf`;
}

/**
 * Fetch a finalized document's PDF for an organization. `externalId` is the
 * FreeFinance document id; `number` (externalNumber) shapes the filename.
 */
export async function getDocumentPdf(
  organizationId: string,
  kind: "offer" | "invoice",
  externalId: string,
  number?: string | null,
): Promise<DocumentAttachment> {
  const client = await getFreeFinanceClient(organizationId);
  const bytes = await client.getDocumentPdf(kind, externalId);
  return { filename: documentFilename(kind, number), contentType: "application/pdf", bytes };
}
