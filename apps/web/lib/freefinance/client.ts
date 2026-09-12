import { assertPublicHttpUrl } from "../automations/url-guard";
import { getAccessToken } from "./auth";
import type { FreeFinanceConfig } from "./config";
import { FreeFinanceApiError, FreeFinanceNotConfiguredError } from "./errors";
import type {
  EInvoiceVersion,
  FfAccount,
  FfClient,
  FfCustomer,
  FfDocument,
  FfDocumentLine,
  FfFeature,
  FfItem,
  FfList,
} from "./types";

/**
 * The FreeFinance API behind an interface (swappable per CLAUDE.md). The HTTP
 * implementation reuses the SSRF-safe fetch pattern from the automations webhook
 * action: the base host is validated once, every call has a timeout and
 * `redirect: "manual"`. A Noop implementation stands in when unconfigured.
 */
export interface FreeFinanceClient {
  listClients(): Promise<FfClient[]>;
  getFeatures(): Promise<FfFeature[]>;
  listIncomeAccounts(): Promise<FfAccount[]>;
  listItems(params?: { search?: string; category?: string; limit?: number; offset?: number }): Promise<FfList<FfItem>>;
  createItem(body: Record<string, unknown>): Promise<FfItem>;
  updateItem(id: string, body: Record<string, unknown>): Promise<FfItem>;
  createCustomer(body: Record<string, unknown>): Promise<FfCustomer>;
  updateCustomer(id: string, body: Record<string, unknown>): Promise<FfCustomer>;
  createOffer(body: Record<string, unknown>): Promise<FfDocument>;
  createInvoice(body: Record<string, unknown>): Promise<FfDocument>;
  finalize(kind: "offer" | "invoice", id: string, body: Record<string, unknown>): Promise<FfDocument>;
  cancel(kind: "offer" | "invoice", id: string): Promise<void>;
  getPayments(id: string): Promise<{ status?: string; open?: number; content?: unknown[] }>;
  getDocumentPdf(kind: "offer" | "invoice", id: string): Promise<Uint8Array>;
  reference<T = unknown>(path: string): Promise<T>;
  /** Global (non-client-scoped) /fnd reference data, e.g. units_of_measure. */
  global<T = unknown>(path: string): Promise<T>;
}

const REQUEST_TIMEOUT_MS = 20_000;

export class HttpFreeFinanceClient implements FreeFinanceClient {
  private hostChecked = false;
  constructor(private readonly config: FreeFinanceConfig) {}

  private base(): string {
    return `${this.config.baseUrl}/api/2.0`;
  }

  private clientPath(rest: string): string {
    return `/clients/${encodeURIComponent(this.config.mandant)}${rest}`;
  }

  private async ensureHost(): Promise<void> {
    if (this.hostChecked) return;
    // Validate the configured base host once (blocks internal/metadata targets).
    await assertPublicHttpUrl(this.config.baseUrl);
    this.hostChecked = true;
  }

  private async request<T>(method: string, path: string, body?: unknown, accept = "application/json"): Promise<{ status: number; data: T; raw: Response }> {
    await this.ensureHost();
    const token = await getAccessToken(this.config);
    const res = await fetch(`${this.base()}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        accept,
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      redirect: "manual",
    });
    if (!res.ok) {
      let parsed: { error?: string; message?: string; identifier?: string } | null = null;
      try {
        parsed = (await res.json()) as typeof parsed;
      } catch {
        parsed = null;
      }
      throw new FreeFinanceApiError(res.status, parsed);
    }
    const data = (accept === "application/json" ? await res.json().catch(() => ({})) : undefined) as T;
    return { status: res.status, data, raw: res };
  }

  async listClients(): Promise<FfClient[]> {
    const { data } = await this.request<FfList<FfClient>>("GET", "/clients");
    return data.content ?? [];
  }

  async getFeatures(): Promise<FfFeature[]> {
    const { data } = await this.request<FfFeature[]>("GET", this.clientPath("/features"));
    return Array.isArray(data) ? data : [];
  }

  async listIncomeAccounts(): Promise<FfAccount[]> {
    const { data } = await this.request<FfList<FfAccount>>("GET", this.clientPath("/cbs/accounts?use=INV"));
    return (data.content ?? []).filter((a) => a.account_type?.logical_account_type === "INCOME");
  }

  async listItems(params: { search?: string; category?: string; limit?: number; offset?: number } = {}): Promise<FfList<FfItem>> {
    const q = new URLSearchParams();
    if (params.search) q.set("search", params.search);
    if (params.category) q.set("category", params.category);
    q.set("limit", String(params.limit ?? 50));
    if (params.offset) q.set("offset", String(params.offset));
    const { data } = await this.request<FfList<FfItem>>("GET", this.clientPath(`/itm/items?${q.toString()}`));
    return data;
  }

  async createItem(body: Record<string, unknown>): Promise<FfItem> {
    return (await this.request<FfItem>("POST", this.clientPath("/itm/items"), body)).data;
  }

  async updateItem(id: string, body: Record<string, unknown>): Promise<FfItem> {
    return (await this.request<FfItem>("PUT", this.clientPath(`/itm/items/${encodeURIComponent(id)}`), body)).data;
  }

  async createCustomer(body: Record<string, unknown>): Promise<FfCustomer> {
    return (await this.request<FfCustomer>("POST", this.clientPath("/mas/customers"), body)).data;
  }

  async updateCustomer(id: string, body: Record<string, unknown>): Promise<FfCustomer> {
    return (await this.request<FfCustomer>("PUT", this.clientPath(`/mas/customers/${encodeURIComponent(id)}`), body)).data;
  }

  async createOffer(body: Record<string, unknown>): Promise<FfDocument> {
    return (await this.request<FfDocument>("POST", this.clientPath("/inv/offers"), body)).data;
  }

  async createInvoice(body: Record<string, unknown>): Promise<FfDocument> {
    return (await this.request<FfDocument>("POST", this.clientPath("/inv/invoices"), body)).data;
  }

  async finalize(kind: "offer" | "invoice", id: string, body: Record<string, unknown>): Promise<FfDocument> {
    const resource = kind === "offer" ? "offers" : "invoices";
    return (await this.request<FfDocument>("POST", this.clientPath(`/inv/${resource}/${encodeURIComponent(id)}/finalize`), body)).data;
  }

  async cancel(kind: "offer" | "invoice", id: string): Promise<void> {
    const resource = kind === "offer" ? "offers" : "invoices";
    await this.request("POST", this.clientPath(`/inv/${resource}/${encodeURIComponent(id)}/cancel`), {});
  }

  async getPayments(id: string): Promise<{ status?: string; open?: number; content?: unknown[] }> {
    return (await this.request<{ status?: string; open?: number; content?: unknown[] }>(
      "GET",
      this.clientPath(`/inv/invoices/${encodeURIComponent(id)}/payments`),
    )).data;
  }

  async getDocumentPdf(kind: "offer" | "invoice", id: string): Promise<Uint8Array> {
    const resource = kind === "offer" ? "offers" : "invoices";
    const { raw } = await this.request<never>("GET", this.clientPath(`/inv/${resource}/${encodeURIComponent(id)}/pdf`), undefined, "application/pdf");
    return new Uint8Array(await raw.arrayBuffer());
  }

  async reference<T = unknown>(path: string): Promise<T> {
    return (await this.request<T>("GET", this.clientPath(path))).data;
  }

  async global<T = unknown>(path: string): Promise<T> {
    return (await this.request<T>("GET", path.startsWith("/") ? path : `/${path}`)).data;
  }
}

/** Stand-in used when FreeFinance is not connected; every call fails loudly. */
export class NoopFreeFinanceClient implements FreeFinanceClient {
  private fail(): never {
    throw new FreeFinanceNotConfiguredError();
  }
  listClients() { return this.fail(); }
  getFeatures() { return this.fail(); }
  listIncomeAccounts() { return this.fail(); }
  listItems() { return this.fail(); }
  createItem() { return this.fail(); }
  updateItem() { return this.fail(); }
  createCustomer() { return this.fail(); }
  updateCustomer() { return this.fail(); }
  createOffer() { return this.fail(); }
  createInvoice() { return this.fail(); }
  finalize() { return this.fail(); }
  cancel() { return this.fail(); }
  getPayments() { return this.fail(); }
  getDocumentPdf() { return this.fail(); }
  reference() { return this.fail(); }
  global() { return this.fail(); }
}

// Re-export for callers that build finalize bodies.
export type { EInvoiceVersion, FfDocumentLine };
