import { centsToDecimal, lineTotals, type LineInput } from "./totals";
import type { FfDocumentLine } from "./types";

/**
 * Pure Kundeo → FreeFinance payload builders. The only place cents become
 * decimals. No I/O, no reference lookups — resolved ids (account, tax entry,
 * customer) are passed in by the caller (sync.ts).
 */

export interface CustomerInput {
  companyName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  salutationCode?: string | null; // FreeFinance salutation code
  title?: string | null;
  vatId?: string | null;
  email?: string | null;
  phone?: string | null;
  street?: string | null;
  postalCode?: string | null;
  city?: string | null;
  country?: string | null; // DE | AT | CH
}

export function mapCustomer(input: CustomerInput): Record<string, unknown> {
  const body: Record<string, unknown> = {
    ignore_in_bsa: false,
    visible: true,
    no_vat_number: !input.vatId,
  };
  if (input.companyName) body.company_name = input.companyName;
  if (input.firstName) body.first_name = input.firstName;
  if (input.lastName) body.last_name = input.lastName;
  if (input.salutationCode) {
    if (input.companyName && !input.firstName) body.comp_salutation_code = input.salutationCode;
    else body.salutation_code = input.salutationCode;
  }
  if (input.title) body.title = input.title;
  if (input.vatId) body.tax_number = input.vatId;
  if (input.email) body.email_address = input.email;
  if (input.phone) body.tel_number = input.phone;
  if (input.street) body.street_name = input.street;
  if (input.postalCode) body.zip_code = input.postalCode;
  if (input.city) body.city = input.city;
  if (input.country) body.country = input.country;
  return body;
}

export interface ProductInput {
  name: string;
  sku?: string | null;
  unitPriceCents: number;
  currency: string;
  unit?: string | null;
  vatRate: number;
}

export function mapItem(input: ProductInput, resolved: { accountId: string; taxClassEntry: string }): Record<string, unknown> {
  const body: Record<string, unknown> = {
    name: input.name,
    account: resolved.accountId,
    amount_type: "NET",
    selling_price: centsToDecimal(input.unitPriceCents),
    currency: input.currency,
    visible: true,
    taxes: { tax_1: { tax_class_entry: resolved.taxClassEntry } },
  };
  if (input.sku) body.number = input.sku;
  if (input.unit) body.unit_of_measure = input.unit;
  return body;
}

export interface LineDraft extends LineInput {
  name: string;
  itemNumber?: string | null;
  unit?: string | null;
  externalItemId?: string | null; // FreeFinance item id, if synced
  account?: string | null; // Konto override id
}

/** Build one FreeFinance document line (net/tax/total computed, verified upstream). */
export function mapLine(line: LineDraft, taxClassEntry: string): FfDocumentLine {
  const t = lineTotals(line);
  const out: FfDocumentLine = {
    amount: line.quantity,
    price_type: "NET",
    item_price: centsToDecimal(line.unitPriceCents),
    net: centsToDecimal(t.netCents),
    total: centsToDecimal(t.totalCents),
    type: "LINE",
    taxes: { tax_1: { tax_class_entry: taxClassEntry, amount: centsToDecimal(t.taxCents) } },
  };
  if (line.externalItemId) {
    out.item = line.externalItemId;
    out.item_defaulting = true;
  } else {
    out.name = line.name;
  }
  if (line.itemNumber) out.item_number = line.itemNumber;
  if (line.unit) out.unit_of_measure = line.unit;
  if (line.account) out.account = line.account;
  if (line.discountValue && line.discountValue > 0) {
    out.discount = line.discountValue;
    out.discount_mode = line.discountMode ?? "RATE";
  }
  return out;
}

export interface DocumentHeader {
  customerId?: string | null;
  customerName?: string | null;
  date: string; // YYYY-MM-DD
  expirationDate?: string | null; // offers
  currency?: string | null;
}

export interface DocumentBodyOptions {
  finalize?: boolean;
  layoutId?: string;
  paymentTermId?: string;
  eInvoice?: string; // NONE | EB_* | X_RECHNUNG_*
  netCents: number;
  taxCents: number;
  totalCents: number;
}

/** Assemble the offer/invoice POST body. `lines` are already mapped. */
export function mapDocumentBody(
  header: DocumentHeader,
  lines: FfDocumentLine[],
  opts: DocumentBodyOptions,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    date: header.date,
    lines,
    net: centsToDecimal(opts.netCents),
    tax: centsToDecimal(opts.taxCents),
    total: centsToDecimal(opts.totalCents),
    text_defaulting: true,
  };
  if (header.customerId) body.customer = header.customerId;
  else if (header.customerName) body.customer_name = header.customerName;
  if (header.currency) body.currency = header.currency;
  if (header.expirationDate) body.expiration_date = header.expirationDate;
  if (opts.paymentTermId) body.payment_term = opts.paymentTermId;
  if (opts.finalize) {
    body.finalize = true;
    if (opts.layoutId) body.layout_setup = opts.layoutId;
    if (opts.eInvoice) body.e_invoice_version = opts.eInvoice;
  }
  return body;
}

/** German salutation label → FreeFinance salutation code (best-effort). */
export function salutationCode(salutation?: string | null, isCompany = false): string | undefined {
  if (isCompany) return "COM";
  const s = (salutation ?? "").toLowerCase();
  if (s.startsWith("herr")) return "MR";
  if (s.startsWith("frau")) return "MRS";
  return undefined;
}
