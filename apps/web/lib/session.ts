import { cache } from "react";
import { headers } from "next/headers";
import { auth } from "@kundeo/auth";
import { withOrg } from "@kundeo/db";

/** Reads the current Better Auth session on the server, or null. */
export async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}

/**
 * Ensures the caller has an active organization and returns its id.
 *
 * This is the one place edition behaviour diverges:
 *  - self-hosted: the first sign-in auto-creates the single org and the user
 *    becomes its owner.
 *  - hosted: org creation happens during a dedicated onboarding flow, so here
 *    we only activate an existing membership (never auto-create).
 *
 * Returns null when unauthenticated or when no org could be resolved.
 */
export const ensureActiveOrgId = cache(async (): Promise<string | null> => {
  const h = await headers();
  const session = await auth.api.getSession({ headers: h });
  if (!session) return null;
  if (session.session.activeOrganizationId) {
    return session.session.activeOrganizationId;
  }

  const listOwn = () => auth.api.listOrganizations({ headers: h });
  let orgId = (await listOwn())?.[0]?.id ?? null;

  if (!orgId && process.env.KUNDEO_EDITION !== "hosted") {
    try {
      const created = await auth.api.createOrganization({
        body: {
          name: "Mein Unternehmen",
          slug: `org-${session.user.id.slice(0, 12)}`,
        },
        headers: h,
      });
      orgId = created?.id ?? null;
    } catch {
      // A concurrent request may have created it first (unique slug) — re-read.
      orgId = (await listOwn())?.[0]?.id ?? null;
    }
  }

  if (orgId) {
    await auth.api.setActiveOrganization({
      body: { organizationId: orgId },
      headers: h,
    });
  }
  return orgId;
});

/**
 * Runs `fn` inside a tenant-scoped transaction (Postgres RLS enforced) for the
 * caller's active organization. Throws if unauthenticated / no org — call sites
 * in the (app) group are already gated by the layout.
 *
 *   const contacts = await scoped((db) => db.contact.findMany());
 */
export async function scoped<T>(
  fn: Parameters<typeof withOrg<T>>[1],
): Promise<T> {
  const orgId = await ensureActiveOrgId();
  if (!orgId) throw new Error("No active organization");
  return withOrg(orgId, fn);
}
