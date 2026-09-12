import { notFound } from "next/navigation";
import { ensureActiveOrgId, scoped } from "@/lib/session";
import { DocumentDetail } from "@/components/documents/document-detail";
import { loadDocumentDetail } from "@/lib/freefinance/detail";

export const dynamic = "force-dynamic";

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const orgId = await ensureActiveOrgId();

  const doc = await scoped((db) => db.document.findUnique({ where: { id }, select: { id: true, kind: true } }));
  if (!doc || doc.kind !== "INVOICE") notFound();

  const detail = await loadDocumentDetail(orgId!, id);
  return <DocumentDetail {...detail} />;
}
