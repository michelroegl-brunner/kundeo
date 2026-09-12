"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { auth } from "@kundeo/auth";
import { prisma } from "@kundeo/db";
import { ensureActiveOrgId, requireOrgRole, scoped } from "@/lib/session";
import { getFreeFinanceClient, isFreeFinanceConnected } from "@/lib/freefinance";
import { encryptSecret } from "@/lib/freefinance/crypto";
import { isEnvConfigured } from "@/lib/freefinance/config";
import { getReferenceData, invalidateReferenceData } from "@/lib/freefinance/refdata";
import { clearTokenCache } from "@/lib/freefinance/auth";
import { FreeFinanceApiError } from "@/lib/freefinance/errors";
import type { ActionResult } from "@/app/(app)/settings/actions";
import type { Option } from "@/lib/freefinance/types";

const PROVIDER = "freefinance";

function fail(e: unknown, fallback: string): ActionResult & Record<string, unknown> {
  if (e instanceof FreeFinanceApiError) {
    return { ok: false, error: e.message, ffError: e.toDisplay() };
  }
  return { ok: false, error: e instanceof Error ? e.message : fallback };
}

export interface FreeFinanceConnectionInput {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  mandant: string;
}

/** Save (create/update) the per-org FreeFinance credentials. */
export async function saveFreeFinanceConnection(
  input: FreeFinanceConnectionInput,
): Promise<ActionResult> {
  if (isEnvConfigured()) {
    return { ok: false, error: "Zugangsdaten aus der Umgebung haben Vorrang und können hier nicht überschrieben werden." };
  }
  try {
    await requireOrgRole("admin");
  } catch (e) {
    return fail(e, "Keine Berechtigung für diese Aktion.");
  }
  const baseUrl = input.baseUrl.trim().replace(/\/+$/, "");
  const clientId = input.clientId.trim();
  const mandant = input.mandant.trim();
  const secret = input.clientSecret.trim();
  if (!baseUrl || !clientId || !mandant) {
    return { ok: false, error: "Base-URL, Client-ID und Mandant sind erforderlich." };
  }
  try {
    await scoped(async (db, organizationId) => {
      const existing = await db.orgIntegration.findFirst({ where: { provider: PROVIDER } });
      if (existing) {
        await db.orgIntegration.update({
          where: { id: existing.id },
          data: {
            baseUrl,
            clientId,
            mandant,
            enabled: true,
            // Only replace the secret when a new one is supplied.
            ...(secret ? { clientSecret: encryptSecret(secret) } : {}),
          },
        });
      } else {
        if (!secret) throw new Error("Client-Secret ist erforderlich.");
        await db.orgIntegration.create({
          data: { organizationId, provider: PROVIDER, baseUrl, clientId, mandant, clientSecret: encryptSecret(secret), enabled: true },
        });
      }
    });
    clearTokenCache();
    const orgId = await ensureActiveOrgId();
    if (orgId) invalidateReferenceData(orgId);
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return fail(e, "Verbindung konnte nicht gespeichert werden.");
  }
}

export interface CapabilityResult {
  mandantLabel?: string;
  productType?: string;
  modules: { mas: boolean; itm: boolean; inv: boolean; cbi: boolean; fis: boolean };
}
export interface FreeFinanceRefData {
  accounts: Option[];
  vatRates: Option[];
  units: Option[];
}

export interface FfErrorDisplay {
  message: string;
  code: string;
  identifier: string;
}

/** Test the connection and return capabilities + reference data for the pickers. */
export async function testFreeFinanceConnection(): Promise<
  ActionResult & { capabilities?: CapabilityResult; refdata?: FreeFinanceRefData; ffError?: FfErrorDisplay }
> {
  try {
    const orgId = await ensureActiveOrgId();
    if (!orgId) return { ok: false, error: "Keine aktive Organisation." };
    if (!(await isFreeFinanceConnected(orgId))) {
      return { ok: false, error: "FreeFinance ist nicht verbunden." };
    }
    const client = await getFreeFinanceClient(orgId);
    const clients = await client.listClients();
    const ref = await getReferenceData(orgId, client, true);

    // The configured Mandant is the first accessible client.
    const mandant = clients[0];
    const capabilities: CapabilityResult = {
      mandantLabel: mandant?.display_name,
      productType: mandant?.product_type,
      modules: ref.modules,
    };
    return {
      ok: true,
      capabilities,
      refdata: { accounts: ref.accounts, vatRates: ref.vatRates, units: ref.units },
    };
  } catch (e) {
    return fail(e, "Die Verbindung konnte nicht hergestellt werden.");
  }
}

/** Remove the per-org credentials (env-based credentials, if any, remain). */
export async function disconnectFreeFinance(): Promise<ActionResult> {
  try {
    await requireOrgRole("admin");
    await scoped(async (db) => {
      await db.orgIntegration.deleteMany({ where: { provider: PROVIDER } });
    });
    clearTokenCache();
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return fail(e, "Verbindung konnte nicht getrennt werden.");
  }
}

export interface FreeFinanceDefaults {
  account: string;
  vatRate: number;
  unit: string;
  eInvoice: string;
}

/** Persist the org-level FreeFinance defaults in Organization.metadata. */
export async function saveFreeFinanceDefaults(defaults: FreeFinanceDefaults): Promise<ActionResult> {
  try {
    const orgId = await ensureActiveOrgId();
    if (!orgId) return { ok: false, error: "Keine aktive Organisation." };
    await requireOrgRole("admin");
    const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { metadata: true } });
    let meta: Record<string, unknown> = {};
    try {
      meta = org?.metadata ? (JSON.parse(org.metadata) as Record<string, unknown>) : {};
    } catch {
      meta = {};
    }
    // Write through Better Auth so the org-update permission is enforced (and we
    // don't mutate the organization row on the bare, RLS-bypassing client).
    await auth.api.updateOrganization({
      body: { organizationId: orgId, data: { metadata: { ...meta, freefinance: defaults } } },
      headers: await headers(),
    });
    revalidatePath("/settings");
    return { ok: true };
  } catch (e) {
    return fail(e, "Standardwerte konnten nicht gespeichert werden.");
  }
}
