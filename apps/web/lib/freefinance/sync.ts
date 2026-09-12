import { withOrg } from "@kundeo/db";
import { getFreeFinanceClient } from "./index";
import { getReferenceData, taxEntryFor } from "./refdata";
import {
  mapCustomer,
  mapItem,
  mapLine,
  mapDocumentBody,
  salutationCode,
  type LineDraft,
} from "./mappers";
import { documentTotals, type DocDiscount } from "./totals";
import { FreeFinanceApiError } from "./errors";

/**
 * Orchestration for FreeFinance sync. Network I/O never runs inside a Prisma
 * transaction: each function reads scoped data, calls the API, then writes the
 * result back. ExternalRef gives every sync an idempotency key (POST when
 * absent, PUT when present).
 */
const PROVIDER = "freefinance";

async function getRef(organizationId: string, entityType: string, entityId: string) {
  return withOrg(organizationId, (tx) =>
    tx.externalRef.findUnique({
      where: { organizationId_provider_entityType_entityId: { organizationId, provider: PROVIDER, entityType, entityId } },
    }),
  );
}

async function putRef(
  organizationId: string,
  entityType: string,
  entityId: string,
  externalId: string,
  externalNumber?: string | null,
) {
  await withOrg(organizationId, (tx) =>
    tx.externalRef.upsert({
      where: { organizationId_provider_entityType_entityId: { organizationId, provider: PROVIDER, entityType, entityId } },
      create: { organizationId, provider: PROVIDER, entityType, entityId, externalId, externalNumber: externalNumber ?? null },
      update: { externalId, externalNumber: externalNumber ?? null, syncedAt: new Date() },
    }),
  );
}

/** Create or update a FreeFinance customer from a Kundeo company (+ its contact). */
export async function syncCompany(organizationId: string, companyId: string): Promise<{ externalId: string; number?: string }> {
  const company = await withOrg(organizationId, (tx) =>
    tx.company.findUnique({ where: { id: companyId }, include: { contacts: { take: 1, orderBy: { createdAt: "asc" } } } }),
  );
  if (!company) throw new Error("Firma nicht gefunden");
  const contact = company.contacts[0];

  const body = mapCustomer({
    companyName: company.name,
    firstName: contact?.firstName,
    lastName: contact?.lastName,
    salutationCode: salutationCode(contact?.salutation, true),
    title: contact?.title,
    vatId: company.vatId,
    email: contact?.email,
    phone: company.phone ?? contact?.phone,
    street: company.street,
    postalCode: company.postalCode,
    city: company.city,
    country: company.country,
  });

  const client = await getFreeFinanceClient(organizationId);
  const ref = await getRef(organizationId, "customer", companyId);
  const result = ref ? await client.updateCustomer(ref.externalId, body) : await client.createCustomer(body);
  await putRef(organizationId, "customer", companyId, result.id, result.customer_number);
  return { externalId: result.id, number: result.customer_number };
}

/** Create or update a FreeFinance item from a Kundeo product. */
export async function syncProduct(organizationId: string, productId: string): Promise<{ externalId: string }> {
  const product = await withOrg(organizationId, (tx) => tx.product.findUnique({ where: { id: productId } }));
  if (!product) throw new Error("Produkt nicht gefunden");

  const client = await getFreeFinanceClient(organizationId);
  const ref = await getReferenceData(organizationId, client);
  const accountId = product.account ?? ref.accounts[0]?.value;
  const taxClassEntry = taxEntryFor(ref, product.vatRate);
  if (!accountId || !taxClassEntry) {
    throw new FreeFinanceApiError(400, { error: "kundeo-account-tax-unresolved", message: "Konto oder Steuersatz konnte nicht aufgelöst werden", identifier: "" });
  }

  const body = mapItem(
    { name: product.name, sku: product.sku, unitPriceCents: product.unitPriceCents, currency: product.currency, unit: product.unit, vatRate: product.vatRate },
    { accountId, taxClassEntry },
  );

  const existing = await getRef(organizationId, "item", productId);
  const result = existing ? await client.updateItem(existing.externalId, body) : await client.createItem(body);
  await putRef(organizationId, "item", productId, result.id, result.number);
  return { externalId: result.id };
}

/** Ensure a product has a FreeFinance item id, syncing it if necessary. */
export async function ensureItem(organizationId: string, productId: string): Promise<string> {
  const ref = await getRef(organizationId, "item", productId);
  if (ref) return ref.externalId;
  return (await syncProduct(organizationId, productId)).externalId;
}

/**
 * Post a persisted Kundeo Document (offer/invoice) to FreeFinance. Reads the
 * document + lines, ensures the customer and item ids exist, builds the payload
 * from the shared totals, posts (optionally finalizing), and writes back the
 * external id, number and status.
 */
export async function postDocument(
  organizationId: string,
  documentId: string,
  opts: { finalize?: boolean; eInvoice?: string } = {},
): Promise<{ externalId: string; number?: string; status: "STAGING" | "FINALIZED" }> {
  const doc = await withOrg(organizationId, (tx) =>
    tx.document.findUnique({ where: { id: documentId }, include: { lines: { orderBy: { position: "asc" } } } }),
  );
  if (!doc) throw new Error("Beleg nicht gefunden");

  const client = await getFreeFinanceClient(organizationId);
  const ref = await getReferenceData(organizationId, client);

  // Ensure the customer exists.
  let customerId: string | undefined;
  if (doc.companyId) customerId = (await syncCompany(organizationId, doc.companyId)).externalId;

  const kind = doc.kind === "OFFER" ? "offer" : "invoice";
  const itemLines = doc.lines.filter((l) => l.type === "ITEM");
  const docDiscountLine = doc.lines.find((l) => l.type === "TOTAL_DISCOUNT");
  const docDiscount: DocDiscount | null =
    doc.discountValue != null && doc.discountMode
      ? { value: Number(doc.discountValue), mode: doc.discountMode as DocDiscount["mode"] }
      : docDiscountLine?.discountValue != null && docDiscountLine.discountMode
        ? { value: Number(docDiscountLine.discountValue), mode: docDiscountLine.discountMode as DocDiscount["mode"] }
        : null;

  // Ensure item ids and build line drafts.
  const drafts: LineDraft[] = [];
  for (const l of itemLines) {
    let externalItemId: string | undefined;
    if (l.productId) {
      try {
        externalItemId = await ensureItem(organizationId, l.productId);
      } catch {
        externalItemId = undefined; // degrade to an ad-hoc line
      }
    }
    drafts.push({
      name: l.name,
      itemNumber: l.itemNumber,
      unit: l.unit,
      quantity: Number(l.quantity),
      unitPriceCents: l.unitPriceCents,
      discountValue: l.discountValue != null ? Number(l.discountValue) : null,
      discountMode: (l.discountMode as LineDraft["discountMode"]) ?? null,
      account: l.account,
      vatRate: l.vatRate,
      externalItemId,
    });
  }

  const totals = documentTotals(drafts, docDiscount);
  const ffLines = drafts.map((d) => {
    const tce = taxEntryFor(ref, d.vatRate);
    if (!tce) throw new FreeFinanceApiError(400, { error: "kundeo-tax-unresolved", message: "Steuersatz konnte nicht aufgelöst werden", identifier: "" });
    return mapLine(d, tce);
  });

  const body = mapDocumentBody(
    {
      customerId,
      customerName: customerId ? undefined : doc.companyId ? undefined : "Kunde",
      date: (doc.issueDate ?? new Date()).toISOString().slice(0, 10),
      expirationDate: doc.expirationDate ? doc.expirationDate.toISOString().slice(0, 10) : undefined,
      currency: doc.currency,
    },
    ffLines,
    {
      finalize: opts.finalize,
      layoutId: ref.defaults.layoutId,
      paymentTermId: ref.defaults.paymentTermId,
      eInvoice: opts.eInvoice ?? doc.eInvoice,
      netCents: totals.netCents,
      taxCents: totals.taxCents,
      totalCents: totals.totalCents,
    },
  );

  const result = kind === "offer" ? await client.createOffer(body) : await client.createInvoice(body);
  const status = result.state === "FINALIZED" ? "FINALIZED" : "STAGING";

  await putRef(organizationId, kind, documentId, result.id, result.number);
  await withOrg(organizationId, (tx) =>
    tx.document.update({
      where: { id: documentId },
      data: {
        status,
        externalNumber: result.number ?? null,
        netCents: totals.netCents,
        taxCents: totals.taxCents,
        totalCents: totals.totalCents,
        dueDate: result.due_date ? new Date(result.due_date) : undefined,
      },
    }),
  );

  return { externalId: result.id, number: result.number, status };
}
