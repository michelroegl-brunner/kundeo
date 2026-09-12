import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "@kundeo/db";
import { hashToken } from "./keys";
import type { McpContext } from "./auth";

/**
 * OAuth 2.1 support for the MCP endpoint — the discovery-based flow remote agents
 * (Claude Cowork, claude.ai connectors, …) use instead of a manually pasted key.
 *
 * This is a deliberately small Authorization Server: dynamic client registration
 * (RFC 7591), authorization code + PKCE (S256 only), and refresh tokens. The
 * human authorization step reuses the caller's existing Better Auth session and
 * their active organization — we never handle passwords here. All secrets are
 * stored as SHA-256 hashes.
 */

export type McpScope = "read_only" | "read_write";

const SCOPE_READ = "crm:read";
const SCOPE_WRITE = "crm:write";
export const SUPPORTED_SCOPES = [SCOPE_READ, SCOPE_WRITE];

const ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const AUTH_CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes

const ACCESS_PREFIX = "kundeo_mcp_at_";
const REFRESH_PREFIX = "kundeo_mcp_rt_";

/** Base URL for issued metadata — env first (proxy-safe), else the request origin. */
export function baseUrl(req: Request): string {
  const env = process.env.BETTER_AUTH_URL?.replace(/\/+$/, "");
  if (env) return env;
  return new URL(req.url).origin;
}

function randomToken(prefix: string): string {
  return prefix + randomBytes(32).toString("hex");
}

function b64urlSha256(input: string): string {
  return createHash("sha256").update(input).digest("base64url");
}

function constantEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

// ── scopes ───────────────────────────────────────────────────────────────────

/** Map a requested OAuth scope string to our internal access level. */
export function resolveScope(requested: string | undefined | null): McpScope {
  const tokens = (requested ?? "").split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return "read_write"; // default matches manual keys
  if (tokens.some((t) => t === SCOPE_WRITE)) return "read_write";
  if (tokens.every((t) => t === SCOPE_READ)) return "read_only";
  // Unknown scope tokens present alongside no write scope → treat as read only.
  if (tokens.some((t) => t === SCOPE_READ)) return "read_only";
  throw new OAuthError("invalid_scope", "Unsupported scope requested");
}

export function scopeToString(scope: McpScope): string {
  return scope === "read_write" ? `${SCOPE_READ} ${SCOPE_WRITE}` : SCOPE_READ;
}

// ── errors ───────────────────────────────────────────────────────────────────

/** An OAuth error rendered as the RFC 6749 `{error, error_description}` body. */
export class OAuthError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
  toBody() {
    return { error: this.code, error_description: this.message };
  }
}

// ── discovery metadata ───────────────────────────────────────────────────────

/** RFC 9728 protected-resource metadata for /api/mcp. */
export function protectedResourceMetadata(req: Request) {
  const base = baseUrl(req);
  return {
    resource: `${base}/api/mcp`,
    authorization_servers: [base],
    scopes_supported: SUPPORTED_SCOPES,
    bearer_methods_supported: ["header"],
    resource_documentation: `${base}/settings/mcp`,
  };
}

/** RFC 8414 authorization-server metadata. */
export function authorizationServerMetadata(req: Request) {
  const base = baseUrl(req);
  return {
    issuer: base,
    authorization_endpoint: `${base}/api/mcp/oauth/authorize`,
    token_endpoint: `${base}/api/mcp/oauth/token`,
    registration_endpoint: `${base}/api/mcp/oauth/register`,
    scopes_supported: SUPPORTED_SCOPES,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
  };
}

// ── dynamic client registration (RFC 7591) ───────────────────────────────────

function isHttpsOrLocalhost(uri: string): boolean {
  try {
    const u = new URL(uri);
    if (u.protocol === "https:") return true;
    // Native/dev clients use a loopback http redirect.
    if (u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1")) {
      return true;
    }
    // Custom app schemes (e.g. a desktop client) are allowed.
    return u.protocol !== "http:" && u.protocol !== "https:";
  } catch {
    return false;
  }
}

export interface RegisteredClient {
  client_id: string;
  client_secret?: string;
  client_id_issued_at: number;
  client_name: string;
  redirect_uris: string[];
  grant_types: string[];
  response_types: string[];
  token_endpoint_auth_method: string;
}

export async function registerClient(body: unknown): Promise<RegisteredClient> {
  const b = (typeof body === "object" && body ? body : {}) as Record<string, unknown>;
  const redirectUris = Array.isArray(b.redirect_uris)
    ? b.redirect_uris.filter((u): u is string => typeof u === "string")
    : [];
  if (redirectUris.length === 0) {
    throw new OAuthError("invalid_redirect_uri", "At least one redirect_uri is required");
  }
  for (const uri of redirectUris) {
    if (!isHttpsOrLocalhost(uri)) {
      throw new OAuthError("invalid_redirect_uri", `Redirect URI not allowed: ${uri}`);
    }
  }

  const authMethod = typeof b.token_endpoint_auth_method === "string" ? b.token_endpoint_auth_method : "none";
  const isPublic = authMethod === "none";
  const clientName =
    typeof b.client_name === "string" && b.client_name.trim() ? b.client_name.trim().slice(0, 120) : "MCP Client";

  const secret = isPublic ? undefined : randomBytes(32).toString("hex");
  const client = await prisma.mcpOAuthClient.create({
    data: {
      clientName,
      redirectUris: JSON.stringify(redirectUris),
      clientSecretHash: secret ? hashToken(secret) : null,
    },
    select: { id: true, createdAt: true },
  });

  return {
    client_id: client.id,
    ...(secret ? { client_secret: secret } : {}),
    client_id_issued_at: Math.floor(client.createdAt.getTime() / 1000),
    client_name: clientName,
    redirect_uris: redirectUris,
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: isPublic ? "none" : authMethod,
  };
}

async function loadClient(clientId: string) {
  const client = await prisma.mcpOAuthClient.findUnique({ where: { id: clientId } });
  if (!client) throw new OAuthError("invalid_client", "Unknown client", 401);
  return { ...client, redirects: JSON.parse(client.redirectUris) as string[] };
}

/** Validate a client_id + redirect_uri pair for the authorize endpoint. */
export async function validateAuthorizeClient(clientId: string, redirectUri: string) {
  const client = await loadClient(clientId);
  if (!client.redirects.includes(redirectUri)) {
    throw new OAuthError("invalid_request", "redirect_uri does not match a registered URI");
  }
  return client;
}

// ── authorization code ───────────────────────────────────────────────────────

export interface IssueCodeInput {
  clientId: string;
  userId: string;
  organizationId: string;
  redirectUri: string;
  scope: McpScope;
  codeChallenge: string;
  codeChallengeMethod: string;
}

/** Persist a single-use, PKCE-bound authorization code and return its plaintext. */
export async function issueAuthCode(input: IssueCodeInput): Promise<string> {
  if (input.codeChallengeMethod !== "S256") {
    throw new OAuthError("invalid_request", "Only the S256 PKCE method is supported");
  }
  const code = randomBytes(32).toString("base64url");
  await prisma.mcpAuthCode.create({
    data: {
      codeHash: hashToken(code),
      clientId: input.clientId,
      userId: input.userId,
      organizationId: input.organizationId,
      redirectUri: input.redirectUri,
      scope: input.scope,
      codeChallenge: input.codeChallenge,
      codeChallengeMethod: "S256",
      expiresAt: new Date(Date.now() + AUTH_CODE_TTL_MS),
    },
  });
  return code;
}

// ── token endpoint ───────────────────────────────────────────────────────────

export interface TokenResponse {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token: string;
  scope: string;
}

/** Authenticate the client on the token endpoint (public via PKCE, or by secret). */
async function authenticateClient(
  clientId: string,
  clientSecret: string | undefined,
): Promise<{ id: string; redirects: string[] }> {
  const client = await loadClient(clientId);
  if (client.clientSecretHash) {
    if (!clientSecret || !constantEquals(client.clientSecretHash, hashToken(clientSecret))) {
      throw new OAuthError("invalid_client", "Invalid client credentials", 401);
    }
  }
  return { id: client.id, redirects: client.redirects };
}

async function issueTokens(row: {
  clientId: string;
  userId: string;
  organizationId: string;
  scope: string;
}): Promise<TokenResponse> {
  const accessToken = randomToken(ACCESS_PREFIX);
  const refreshToken = randomToken(REFRESH_PREFIX);
  const now = Date.now();
  await prisma.mcpAccessToken.create({
    data: {
      tokenHash: hashToken(accessToken),
      refreshTokenHash: hashToken(refreshToken),
      clientId: row.clientId,
      userId: row.userId,
      organizationId: row.organizationId,
      scope: row.scope,
      expiresAt: new Date(now + ACCESS_TOKEN_TTL_MS),
      refreshExpiresAt: new Date(now + REFRESH_TOKEN_TTL_MS),
    },
  });
  return {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: Math.floor(ACCESS_TOKEN_TTL_MS / 1000),
    refresh_token: refreshToken,
    scope: scopeToString(row.scope === "read_only" ? "read_only" : "read_write"),
  };
}

/** authorization_code grant: verify PKCE + redirect_uri, consume the code, issue tokens. */
export async function exchangeAuthorizationCode(params: {
  code: string;
  redirectUri: string;
  clientId: string;
  clientSecret?: string;
  codeVerifier: string;
}): Promise<TokenResponse> {
  const client = await authenticateClient(params.clientId, params.clientSecret);

  const record = await prisma.mcpAuthCode.findUnique({ where: { codeHash: hashToken(params.code) } });
  if (!record) throw new OAuthError("invalid_grant", "Invalid authorization code");

  // Always consume first (single use), even on subsequent failures.
  if (record.consumedAt) {
    // Reuse of a consumed code is a signal of theft — revoke tokens from it.
    await prisma.mcpAccessToken.updateMany({
      where: { clientId: record.clientId, userId: record.userId, organizationId: record.organizationId },
      data: { revokedAt: new Date() },
    });
    throw new OAuthError("invalid_grant", "Authorization code already used");
  }
  await prisma.mcpAuthCode.update({ where: { id: record.id }, data: { consumedAt: new Date() } });

  if (record.expiresAt.getTime() <= Date.now()) throw new OAuthError("invalid_grant", "Authorization code expired");
  if (record.clientId !== client.id) throw new OAuthError("invalid_grant", "Code was issued to another client");
  if (record.redirectUri !== params.redirectUri) throw new OAuthError("invalid_grant", "redirect_uri mismatch");
  if (!params.codeVerifier) throw new OAuthError("invalid_request", "code_verifier is required");
  if (b64urlSha256(params.codeVerifier) !== record.codeChallenge) {
    throw new OAuthError("invalid_grant", "PKCE verification failed");
  }

  return issueTokens(record);
}

/** refresh_token grant: rotate the refresh token and issue a fresh access token. */
export async function refreshAccessToken(params: {
  refreshToken: string;
  clientId: string;
  clientSecret?: string;
}): Promise<TokenResponse> {
  const client = await authenticateClient(params.clientId, params.clientSecret);
  const record = await prisma.mcpAccessToken.findUnique({
    where: { refreshTokenHash: hashToken(params.refreshToken) },
  });
  if (!record || record.revokedAt) throw new OAuthError("invalid_grant", "Invalid refresh token");
  if (record.clientId !== client.id) throw new OAuthError("invalid_grant", "Refresh token issued to another client");
  if (record.refreshExpiresAt && record.refreshExpiresAt.getTime() <= Date.now()) {
    throw new OAuthError("invalid_grant", "Refresh token expired");
  }

  // Rotate: revoke the old token row, issue a new pair.
  await prisma.mcpAccessToken.update({ where: { id: record.id }, data: { revokedAt: new Date() } });
  return issueTokens(record);
}

// ── bearer resolution (used by authenticateMcp) ──────────────────────────────

/** Resolve an OAuth access token to an MCP context, or null. */
export async function resolveOAuthToken(bearer: string): Promise<McpContext | null> {
  if (!bearer.startsWith(ACCESS_PREFIX)) return null;
  const record = await prisma.mcpAccessToken.findUnique({ where: { tokenHash: hashToken(bearer) } });
  if (!record || record.revokedAt) return null;
  if (record.expiresAt.getTime() <= Date.now()) return null;

  const now = Date.now();
  if (!record.lastUsedAt || now - record.lastUsedAt.getTime() > 60_000) {
    prisma.mcpAccessToken.update({ where: { id: record.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  }
  return {
    keyId: record.id,
    organizationId: record.organizationId,
    userId: record.userId,
    scope: record.scope === "read_only" ? "read_only" : "read_write",
  };
}
