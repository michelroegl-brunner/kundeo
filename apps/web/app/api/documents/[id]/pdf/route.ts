import { NextResponse } from "next/server";
import { getSession, ensureActiveOrgId, scoped } from "@/lib/session";
import { getDocumentPdf, documentFilename } from "@/lib/freefinance/documents";

export const dynamic = "force-dynamic";

/** Streams a finalized document's PDF, fetched on demand from FreeFinance. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  const orgId = await ensureActiveOrgId();
  if (!orgId) return NextResponse.json({ error: "no-org" }, { status: 401 });

  const info = await scoped(async (db) => {
    const doc = await db.document.findUnique({ where: { id } });
    if (!doc) return null;
    const entityType = doc.kind === "OFFER" ? "offer" : "invoice";
    const ref = await db.externalRef.findFirst({ where: { provider: "freefinance", entityType, entityId: id } });
    return { kind: entityType as "offer" | "invoice", externalId: ref?.externalId, number: doc.externalNumber };
  });

  if (!info) return NextResponse.json({ error: "not-found" }, { status: 404 });
  if (!info.externalId) return NextResponse.json({ error: "not-finalized" }, { status: 409 });

  try {
    const attachment = await getDocumentPdf(orgId, info.kind, info.externalId, info.number);
    return new NextResponse(Buffer.from(attachment.bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${documentFilename(info.kind, info.number)}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "pdf-failed" }, { status: 502 });
  }
}
