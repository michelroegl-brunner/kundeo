import type { FreeFinanceConfig } from "./config";
import { FreeFinanceApiError } from "./errors";

/**
 * OIDC client-credentials token handling. Access tokens live ~300s with no
 * refresh token, so we cache in memory per (baseUrl, clientId) and re-fetch
 * ~30s before expiry. The token endpoint is discovered from the instance's
 * issuer (cached), so dev/prod realms work without hardcoding.
 */
interface CachedToken {
  value: string;
  expiresAt: number;
}

const tokenCache = new Map<string, CachedToken>();
const issuerCache = new Map<string, string>(); // baseUrl → token endpoint

const cacheKey = (c: FreeFinanceConfig) => `${c.baseUrl}::${c.clientId}`;

async function tokenEndpoint(baseUrl: string): Promise<string> {
  const cached = issuerCache.get(baseUrl);
  if (cached) return cached;
  const res = await fetch(`${baseUrl}/api/2.0/auth/issuer`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new FreeFinanceApiError(res.status, null, "Issuer konnte nicht ermittelt werden");
  const json = (await res.json()) as { url: string };
  const endpoint = `${json.url.replace(/\/+$/, "")}/protocol/openid-connect/token`;
  issuerCache.set(baseUrl, endpoint);
  return endpoint;
}

export async function getAccessToken(config: FreeFinanceConfig): Promise<string> {
  const key = cacheKey(config);
  const cached = tokenCache.get(key);
  if (cached && cached.expiresAt > Date.now() + 30_000) return cached.value;

  const endpoint = await tokenEndpoint(config.baseUrl);
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(15_000),
    redirect: "manual",
  });
  if (!res.ok) {
    // Do not include the response body — it may echo credentials.
    throw new FreeFinanceApiError(res.status, null, "Token-Anfrage fehlgeschlagen");
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache.set(key, { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 });
  return json.access_token;
}

/** Drop cached tokens (e.g. after credentials change). */
export function clearTokenCache(): void {
  tokenCache.clear();
  issuerCache.clear();
}
