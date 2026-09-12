import { withOrg } from "@kundeo/db";
import type { DocumentDetailProps, DetailLine, DunningInfo } from "@/components/documents/document-detail";
import { nextDunningDueAt, isDunningDue, openCents } from "@/lib/dunning/math";

/** Assemble the shared DocumentDetail props for a finalized/cancelled document. */
export async function loadDocumentDetail(organizationId: string, documentId: string): Promise<DocumentDetailProps> {
  return withOrg(organizationId, async (tx) => {
    const doc = await tx.document.findUniqueOrThrow({
      where: { id: documentId },
      include: { lines: { orderBy: { position: "asc" } } },
    });
    const company = doc.companyId ? await tx.company.findUnique({ where: { id: doc.companyId }, include: { contacts: { take: 1, orderBy: { createdAt: "asc" } } } }) : null;
    const contact = doc.contactId ? await tx.contact.findUnique({ where: { id: doc.contactId } }) : company?.contacts[0] ?? null;
    const templates = await tx.emailTemplate.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });

    const kind = doc.kind === "OFFER" ? "offer" : "invoice";
    const lines: DetailLine[] = doc.lines.map((l) => ({
      id: l.id,
      position: l.position,
      type: l.type,
      name: l.name,
      itemNumber: l.itemNumber ?? "",
      quantity: Number(l.quantity),
      unit: l.unit ?? "",
      unitPriceCents: l.unitPriceCents,
      discountLabel: discountLabel(l.discountValue != null ? Number(l.discountValue) : null, l.discountMode),
      account: l.account ?? "",
      vatRate: l.vatRate,
      netCents: l.netCents,
      totalCents: l.totalCents,
    }));

    const history: { at: string; text: string }[] = [{ at: doc.createdAt.toISOString(), text: "Erstellt" }];
    if (doc.status === "FINALIZED") history.push({ at: doc.updatedAt.toISOString(), text: `Finalisiert${doc.externalNumber ? ` · ${doc.externalNumber}` : ""}` });
    if (doc.status === "CANCELLED") history.push({ at: doc.updatedAt.toISOString(), text: "Storniert" });

    // Mahnwesen info + Verlauf (invoices only).
    let dunning: DunningInfo | null = null;
    if (kind === "invoice") {
      const policy = await tx.dunningPolicy.findFirst({ include: { levels: { orderBy: { level: "asc" } } } });
      const runs = await tx.dunningRun.findMany({ where: { documentId: doc.id }, orderBy: { createdAt: "asc" } });
      for (const r of runs) history.push({ at: r.createdAt.toISOString(), text: `${r.label} versendet` });

      if (policy) {
        const maxLevel = policy.levels.length;
        const level = doc.dunningLevel;
        const open = openCents(doc.totalCents, doc.paidCents);
        dunning = {
          level,
          maxLevel,
          currentLabel: level > 0 ? policy.levels[level - 1]?.label ?? null : null,
          nextLabel: level < maxLevel ? policy.levels[level]?.label ?? null : null,
          nextDueAt: doc.dueDate ? nextDunningDueAt(doc.dueDate, level, policy).toISOString() : null,
          pausedUntil: doc.dunningPausedUntil ? doc.dunningPausedUntil.toISOString() : null,
          active: policy.isActive,
          due: isDunningDue({ dueDate: doc.dueDate, openCents: open, currentLevel: level, maxLevel, pausedUntil: doc.dunningPausedUntil, policy, now: new Date() }),
        };
      }
    }
    history.sort((a, b) => a.at.localeCompare(b.at));

    return {
      id: doc.id,
      kind,
      status: doc.status,
      number: doc.externalNumber ?? "",
      customer: company?.name ?? "—",
      contact: contact ? `${contact.firstName} ${contact.lastName}`.trim() : "",
      date: doc.issueDate ? doc.issueDate.toISOString() : "",
      expirationDate: doc.expirationDate ? doc.expirationDate.toISOString() : "",
      dueDate: doc.dueDate ? doc.dueDate.toISOString() : "",
      eInvoice: doc.eInvoice,
      currency: doc.currency,
      netCents: doc.netCents,
      taxCents: doc.taxCents,
      totalCents: doc.totalCents,
      lines,
      payment:
        kind === "invoice"
          ? { status: doc.paymentStatus, paidCents: doc.paidCents, entries: [] }
          : undefined,
      pdf: { state: doc.status === "FINALIZED" ? "ready" : "none", filename: `${kind === "offer" ? "Angebot" : "Rechnung"}_${doc.externalNumber ?? ""}.pdf` },
      invoicing: true,
      emailTemplates: templates,
      recipient: contact?.email ?? "",
      history,
      dunning,
    };
  });
}

function discountLabel(value: number | null, mode: string | null): string {
  if (!value) return "";
  return mode === "CONSTANT" ? `${value.toFixed(2)} €` : `${value} %`;
}
