import { resolveFreeFinanceConfig } from "./config";
import { HttpFreeFinanceClient, NoopFreeFinanceClient, type FreeFinanceClient } from "./client";

/**
 * Entry point: resolve a FreeFinance client for an organization, or a Noop when
 * unconfigured. A test seam lets specs inject a fake without touching env/DB.
 */
let override: FreeFinanceClient | null = null;

export async function getFreeFinanceClient(organizationId: string): Promise<FreeFinanceClient> {
  if (override) return override;
  const config = await resolveFreeFinanceConfig(organizationId);
  return config ? new HttpFreeFinanceClient(config) : new NoopFreeFinanceClient();
}

/** True when credentials exist (nav gating, capability checks). */
export async function isFreeFinanceConnected(organizationId: string): Promise<boolean> {
  if (override) return true;
  return (await resolveFreeFinanceConfig(organizationId)) !== null;
}

/** Test seam: inject a fake client (or null to restore real resolution). */
export function setFreeFinanceClient(next: FreeFinanceClient | null): void {
  override = next;
}

export type { FreeFinanceClient } from "./client";
export { FreeFinanceApiError, FreeFinanceNotConfiguredError, isRetryable } from "./errors";
export * from "./totals";
