import "server-only";
import { prisma } from "@kundeo/db";
import { hashToken, hashesEqual, looksLikeToken } from "./keys";

/**
 * Resolved identity behind an MCP request. All CRM access performed on behalf of
 * a request is scoped to `organizationId` (via withOrg → RLS); `scope` decides
 * whether write tools are allowed.
 */
export interface McpContext {
  keyId: string;
  organizationId: string;
  /** Creator of the key, for attribution on writes. May be null. */
  userId: string | null;
  scope: "read_only" | "read_write";
}

/** How long before we bother touching the DB again to record key usage. */
const LAST_USED_THROTTLE_MS = 60_000;

/**
 * Authenticate an incoming MCP request from its `Authorization: Bearer` header.
 * Returns the resolved context, or null when there is no valid, live key.
 *
 * This is the one seam where auth behaviour could diverge by edition: self-host
 * uses org-scoped bearer keys with no external dependency. A hosted edition
 * could add OAuth here without touching the protocol handler or the tools.
 *
 * The key lookup runs on the bare client on purpose — we must map a token to an
 * organization before any org context exists (mcp_api_key is auth
 * infrastructure, not an RLS-scoped tenant table; see schema.prisma).
 */
export async function authenticateMcp(req: Request): Promise<McpContext | null> {
  const header = req.headers.get("authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match?.[1]) return null;

  const token = match[1].trim();
  if (!looksLikeToken(token)) return null;

  const keyHash = hashToken(token);
  const key = await prisma.mcpApiKey.findUnique({
    where: { keyHash },
    select: {
      id: true,
      keyHash: true,
      organizationId: true,
      createdByUserId: true,
      scope: true,
      revokedAt: true,
      expiresAt: true,
      lastUsedAt: true,
    },
  });

  // Compare in constant time even though findUnique already matched, so the
  // path taken for a real key and a near-miss stays uniform.
  if (!key || !hashesEqual(key.keyHash, keyHash)) return null;
  if (key.revokedAt) return null;
  if (key.expiresAt && key.expiresAt.getTime() <= Date.now()) return null;

  // Best-effort, throttled usage stamp — never block or fail the request on it.
  const now = Date.now();
  if (!key.lastUsedAt || now - key.lastUsedAt.getTime() > LAST_USED_THROTTLE_MS) {
    prisma.mcpApiKey
      .update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
      .catch(() => {});
  }

  return {
    keyId: key.id,
    organizationId: key.organizationId,
    userId: key.createdByUserId,
    scope: key.scope === "read_only" ? "read_only" : "read_write",
  };
}
