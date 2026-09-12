import { withOrg } from "@kundeo/db";
import { decryptSecret } from "./crypto";

/**
 * FreeFinance credentials resolution — env-first (self-host, single org) → a
 * per-org OrgIntegration row (hosted). Env wins so a self-host operator can pin
 * credentials without touching the DB, matching the email module's approach.
 */
export interface FreeFinanceConfig {
  baseUrl: string; // without /api/2.0
  clientId: string;
  clientSecret: string;
  mandant: string; // numeric FreeFinance client id
  source: "env" | "db";
}

/** Non-secret view for the settings UI. */
export interface FreeFinanceConfigPublic {
  baseUrl: string;
  clientId: string;
  mandant: string;
  hasSecret: boolean;
  source: "env" | "db" | null;
}

const PROVIDER = "freefinance";
const env = (k: string): string | undefined => {
  const v = process.env[k];
  return v && v.trim() ? v.trim() : undefined;
};

function fromEnv(): FreeFinanceConfig | null {
  const baseUrl = env("KUNDEO_FREEFINANCE_BASE_URL");
  const clientId = env("KUNDEO_FREEFINANCE_CLIENT_ID");
  const clientSecret = env("KUNDEO_FREEFINANCE_CLIENT_SECRET");
  const mandant = env("KUNDEO_FREEFINANCE_MANDANT");
  if (baseUrl && clientId && clientSecret && mandant) {
    return { baseUrl: baseUrl.replace(/\/+$/, ""), clientId, clientSecret, mandant, source: "env" };
  }
  return null;
}

async function fromDb(organizationId: string): Promise<FreeFinanceConfig | null> {
  const row = await withOrg(organizationId, (tx) =>
    tx.orgIntegration.findFirst({ where: { provider: PROVIDER, enabled: true } }),
  );
  if (!row) return null;
  return {
    baseUrl: row.baseUrl.replace(/\/+$/, ""),
    clientId: row.clientId,
    clientSecret: decryptSecret(row.clientSecret),
    mandant: row.mandant,
    source: "db",
  };
}

/** Full config (with the decrypted secret) for making API calls, or null. */
export async function resolveFreeFinanceConfig(organizationId: string): Promise<FreeFinanceConfig | null> {
  return fromEnv() ?? (await fromDb(organizationId));
}

/** Non-secret config for the settings UI. Env fields render read-only. */
export async function resolveFreeFinanceConfigPublic(organizationId: string): Promise<FreeFinanceConfigPublic> {
  const e = fromEnv();
  if (e) return { baseUrl: e.baseUrl, clientId: e.clientId, mandant: e.mandant, hasSecret: true, source: "env" };
  const row = await withOrg(organizationId, (tx) =>
    tx.orgIntegration.findFirst({ where: { provider: PROVIDER } }),
  );
  if (row) {
    return { baseUrl: row.baseUrl, clientId: row.clientId, mandant: row.mandant, hasSecret: Boolean(row.clientSecret), source: "db" };
  }
  return { baseUrl: "", clientId: "", mandant: "", hasSecret: false, source: null };
}

export function isEnvConfigured(): boolean {
  return fromEnv() !== null;
}
