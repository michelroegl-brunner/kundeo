/**
 * FreeFinance REST API — the subset of shapes Kundeo uses.
 *
 * Base URL: {baseUrl}/api/2.0 · every tenant resource is nested under the
 * numeric client id (Mandant): /clients/{mandant}/{module}/{resource}.
 * JSON is snake_case; amounts are decimal numbers (not minor units); dates are
 * ISO `YYYY-MM-DD`. See docs/integrations/freefinance.md.
 */

/** Structured error body returned by the API (validated live). */
export interface FfErrorBody {
  error: string; // stable machine code, e.g. "cbs-account-tax-information-invalid"
  message: string; // localised (German) UI text
  identifier: string; // support correlation id — log it
  details?: unknown[];
  payload?: unknown[];
}

/** A generic sliced list response. */
export interface FfList<T> {
  total_count: number;
  content: T[];
  limit?: number;
  offset?: number;
}

export interface FfClient {
  id: number;
  display_name?: string;
  product_type?: string; // "DEA" | "CMA" | "RLA"
  country?: string;
}

export interface FfFeature {
  name: string;
  state: string; // "ACTIVE" | ...
}

export interface FfTaxClassEntryRef {
  id: string;
  key_name?: string;
  code?: string;
  tax_rate_value?: number;
}

export interface FfAccount {
  id: string;
  name: string;
  code: string;
  account_type?: { logical_account_type?: string };
  default_taxes?: { tax_1?: { tax_class_entry?: FfTaxClassEntryRef } };
}

export interface FfCustomer {
  id: string;
  customer_number?: string;
  display_name?: string;
  company_name?: string;
  email_address?: string;
}

export interface FfItem {
  id: string;
  number?: string;
  name: string;
  selling_price?: number;
  amount_type?: "NET" | "GROSS";
  currency?: string;
  unit_of_measure?: string;
  account?: { id: string; code?: string; name?: string };
  taxes?: { tax_1?: { tax_class_entry?: FfTaxClassEntryRef } };
}

/** A tax slot on a line as posted to FreeFinance. */
export interface FfLineTax {
  tax_class_entry: string;
  amount: number;
}

/** A business-document line as posted to FreeFinance (offers/invoices, INV). */
export interface FfDocumentLine {
  item?: string;
  item_defaulting?: boolean;
  name?: string;
  item_number?: string;
  amount: number; // quantity
  item_price?: number;
  price_type?: "NET" | "GROSS";
  discount?: number;
  discount_mode?: "RATE" | "CONSTANT";
  account?: string;
  net: number;
  total: number;
  type?: "LINE" | "TOTAL_DISCOUNT" | "TOTAL_SURCHARGE";
  unit_of_measure?: string;
  taxes: { tax_1: FfLineTax };
}

export interface FfDocument {
  id: string;
  type?: string;
  state?: "STAGING" | "FINALIZED" | "CANCELLED";
  number?: string;
  date?: string;
  due_date?: string;
  net?: number;
  tax?: number;
  total?: number;
  open?: number;
  currency?: string;
}

/** e-invoice version passed at finalize; NONE skips e-invoicing. */
export type EInvoiceVersion =
  | "NONE"
  | "EB_V6_P1"
  | "EB_V6_P0"
  | "X_RECHNUNG_V3_P0_UBL";

/** A simple select option for the settings/reference-data UI. */
export interface Option {
  value: string;
  label: string;
}
