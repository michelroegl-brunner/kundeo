import "server-only";
import PDFDocument from "pdfkit";

/**
 * Renders a Mahnung letter as a PDF, in pure Node (pdfkit) — no headless browser,
 * so it works in the self-host `standalone` build with no external service. The
 * built-in Helvetica font uses WinAnsi encoding, which covers € and the German
 * umlauts, so no font file needs embedding.
 *
 * pdfkit reads its AFM metrics from its own package at runtime; it is listed in
 * `serverExternalPackages` (next.config) so Next keeps those files on disk in
 * the traced standalone output instead of bundling the module.
 */

export interface MahnungPdfData {
  orgName: string;
  levelLabel: string;
  customerName: string;
  invoiceNumber: string;
  invoiceDate: string; // preformatted (de-AT)
  dueDate: string; // preformatted
  daysOverdue: number;
  currency: string;
  openCents: number;
  feeCents: number;
  interestCents: number;
  totalCents: number;
  date: string; // today, preformatted
}

function eur(cents: number, currency: string): string {
  const sign = cents < 0 ? "-" : "";
  const s = Math.abs(cents).toString().padStart(3, "0");
  const whole = s.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${sign}${whole},${s.slice(-2)} ${currency === "EUR" ? "€" : currency}`;
}

/** Build the Mahnung PDF and return its bytes. */
export function renderMahnungPdf(data: MahnungPdfData): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: 56 });
      const chunks: Buffer[] = [];
      doc.on("data", (c: Buffer) => chunks.push(c));
      doc.on("end", () => resolve(new Uint8Array(Buffer.concat(chunks))));
      doc.on("error", reject);

      const { currency } = data;
      const right = doc.page.width - 56;

      // Sender / header
      doc.font("Helvetica-Bold").fontSize(14).text(data.orgName, { align: "left" });
      doc.moveDown(2);

      // Recipient + date line
      doc.font("Helvetica").fontSize(11).text(data.customerName);
      doc.moveDown(1.5);
      doc.text(data.date, { align: "right" });
      doc.moveDown(1);

      // Subject
      doc.font("Helvetica-Bold").fontSize(12).text(`${data.levelLabel} zu Rechnung ${data.invoiceNumber}`);
      doc.moveDown(1);

      // Body
      doc
        .font("Helvetica")
        .fontSize(11)
        .text("Sehr geehrte Damen und Herren,", { align: "left" })
        .moveDown(0.7)
        .text(
          `zur Rechnung ${data.invoiceNumber} vom ${data.invoiceDate} ist ein offener Betrag ` +
            `von ${eur(data.openCents, currency)} seit ${data.daysOverdue} Tagen (fällig am ${data.dueDate}) ` +
            `nicht beglichen. Wir dürfen Sie höflich an die Zahlung erinnern.`,
        )
        .moveDown(1);

      // Amounts table
      const rows: [string, number, boolean][] = [
        ["Offener Rechnungsbetrag", data.openCents, false],
        ["Mahngebühr", data.feeCents, false],
        ["Verzugszinsen", data.interestCents, false],
        ["Gesamtbetrag", data.totalCents, true],
      ];
      for (const [label, cents, strong] of rows) {
        const y = doc.y;
        doc.font(strong ? "Helvetica-Bold" : "Helvetica").fontSize(11);
        doc.text(label, 56, y);
        doc.text(eur(cents, currency), 56, y, { align: "right", width: right - 56 });
        doc.moveDown(0.4);
        if (strong) {
          doc.moveTo(56, doc.y).lineTo(right, doc.y).lineWidth(0.5).stroke();
        }
      }
      doc.moveDown(1.5);

      doc
        .font("Helvetica")
        .fontSize(11)
        .text(
          "Bitte überweisen Sie den Gesamtbetrag umgehend. Sollte sich Ihre Zahlung mit diesem " +
            "Schreiben überschnitten haben, betrachten Sie es bitte als gegenstandslos.",
        )
        .moveDown(1.2)
        .text("Mit freundlichen Grüßen")
        .moveDown(0.5)
        .text(data.orgName);

      doc.end();
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}
