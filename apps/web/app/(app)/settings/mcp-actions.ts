"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@kundeo/db";
import { ensureActiveOrgId, getSession, requireOrgRole } from "@/lib/session";
import { generateKey } from "@/lib/mcp/keys";

/**
 * MCP key management. Keys are auth infrastructure (not RLS-scoped tenant data),
 * so we read/write them on the bare client and scope every query explicitly by
 * organizationId. All mutations are gated on an admin role: an MCP key grants an
 * external agent full access to the org's CRM data.
 */

export type McpScope = "read_only" | "read_write";

export interface McpKeyItem {
  id: string;
  name: string;
  keyPrefix: string;
  scope: McpScope;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export type CreateKeyResult =
  | { ok: true; token: string; key: McpKeyItem }
  | { ok: false; error: string };

export type ActionResult = { ok: boolean; error?: string };

function toItem(k: {
  id: string;
  name: string;
  keyPrefix: string;
  scope: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
}): McpKeyItem {
  return {
    id: k.id,
    name: k.name,
    keyPrefix: k.keyPrefix,
    scope: k.scope === "read_only" ? "read_only" : "read_write",
    createdAt: k.createdAt.toISOString(),
    lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
    revokedAt: k.revokedAt?.toISOString() ?? null,
  };
}

const SELECT = {
  id: true,
  name: true,
  keyPrefix: true,
  scope: true,
  createdAt: true,
  lastUsedAt: true,
  revokedAt: true,
} as const;

/** List the org's keys (newest first). Never returns secrets — only prefixes. */
export async function listMcpKeys(): Promise<McpKeyItem[]> {
  const orgId = await ensureActiveOrgId();
  if (!orgId) return [];
  const keys = await prisma.mcpApiKey.findMany({
    where: { organizationId: orgId },
    orderBy: { createdAt: "desc" },
    select: SELECT,
  });
  return keys.map(toItem);
}

/** Create a key and return the plaintext token once — it is never retrievable again. */
export async function createMcpKey(name: string, scope: McpScope): Promise<CreateKeyResult> {
  try {
    await requireOrgRole("admin");
  } catch {
    return { ok: false, error: "Keine Berechtigung." };
  }
  const orgId = await ensureActiveOrgId();
  if (!orgId) return { ok: false, error: "Keine aktive Organisation." };

  const label = name.trim();
  if (!label) return { ok: false, error: "Bitte einen Namen angeben." };
  if (label.length > 80) return { ok: false, error: "Name ist zu lang (max. 80 Zeichen)." };
  const resolvedScope: McpScope = scope === "read_only" ? "read_only" : "read_write";

  const session = await getSession();
  const { token, keyHash, keyPrefix } = generateKey();

  const key = await prisma.mcpApiKey.create({
    data: {
      organizationId: orgId,
      name: label,
      keyHash,
      keyPrefix,
      scope: resolvedScope,
      createdByUserId: session?.user.id ?? null,
    },
    select: SELECT,
  });

  revalidatePath("/settings/mcp");
  return { ok: true, token, key: toItem(key) };
}

/** Revoke a key immediately. Idempotent; scoped to the caller's org. */
export async function revokeMcpKey(id: string): Promise<ActionResult> {
  try {
    await requireOrgRole("admin");
  } catch {
    return { ok: false, error: "Keine Berechtigung." };
  }
  const orgId = await ensureActiveOrgId();
  if (!orgId) return { ok: false, error: "Keine aktive Organisation." };

  // updateMany with the org filter guarantees we never touch another org's key.
  const res = await prisma.mcpApiKey.updateMany({
    where: { id, organizationId: orgId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (res.count === 0) return { ok: false, error: "Schlüssel nicht gefunden." };

  revalidatePath("/settings/mcp");
  return { ok: true };
}
