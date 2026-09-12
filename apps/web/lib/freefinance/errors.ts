import type { FfErrorBody } from "./types";

/**
 * A FreeFinance API failure. Carries the machine `code` and support `identifier`
 * so handlers can log the identifier and surface the German `message`. Tokens
 * and secrets must never be attached to this.
 */
export class FreeFinanceApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly identifier: string;

  constructor(status: number, body: Partial<FfErrorBody> | null, fallback = "FreeFinance-Anfrage fehlgeschlagen") {
    super(body?.message?.trim() || fallback);
    this.name = "FreeFinanceApiError";
    this.status = status;
    this.code = body?.error ?? `http_${status}`;
    this.identifier = body?.identifier ?? "";
  }

  /** Plain object for `ActionResult.error` / client display (no secrets). */
  toDisplay(): { message: string; code: string; identifier: string } {
    return { message: this.message, code: this.code, identifier: this.identifier };
  }
}

/** Thrown when no usable FreeFinance credentials are configured. */
export class FreeFinanceNotConfiguredError extends Error {
  constructor() {
    super("FreeFinance ist nicht verbunden");
    this.name = "FreeFinanceNotConfiguredError";
  }
}

/**
 * Whether a failure is worth retrying (network, 5xx, 429, token). 4xx validation
 * errors are terminal — surface them, never loop.
 */
export function isRetryable(err: unknown): boolean {
  if (err instanceof FreeFinanceApiError) {
    return err.status === 0 || err.status === 429 || err.status >= 500;
  }
  // AbortError / network failure / DNS
  return true;
}
