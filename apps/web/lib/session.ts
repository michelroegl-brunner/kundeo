import { randomUUID } from "node:crypto";
import { cache } from "react";
import { headers } from "next/headers";
import { auth } from "@kundeo/auth";
import { prisma, withOrg } from "@kundeo/db";

/** Reads the current Better Auth session on the server, or null. */
export async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}

/** Organization roles configured on the Better Auth org plugin, ranked. */
export type OrgRole = "member" | "admin" | "owner";
const ROLE_RANK: Record<OrgRole, number> = { member: 0, admin: 1, owner: 2 };

/**
 * The caller's role in their active organization, or null when there is no
 * active membership (unauthenticated / no org). Better Auth may store several
 * comma-separated roles on a member; we take the highest and treat any unknown
 * role as no privilege (null).
 */
export async function activeOrgRole(): Promise<OrgRole | null> {
  const h = await headers();
  let member: { role?: string | null } | null = null;
  try {
    member = await auth.api.getActiveMember({ headers: h });
  } catch {
    return null;
  }
  if (!member?.role) return null;
  let best: OrgRole | null = null;
  for (const r of String(member.role).split(",").map((s) => s.trim())) {
    if (r in ROLE_RANK && (best === null || ROLE_RANK[r as OrgRole] > ROLE_RANK[best])) {
      best = r as OrgRole;
    }
  }
  return best;
}

/**
 * Throws unless the caller's active-org role is at least `min`. Use at the top
 * of server actions that mutate org-level configuration (integration
 * credentials, defaults) so authorization is enforced server-side, not just in
 * the UI.
 */
export async function requireOrgRole(min: OrgRole): Promise<void> {
  const role = await activeOrgRole();
  if (role === null || ROLE_RANK[role] < ROLE_RANK[min]) {
    throw new Error("Keine Berechtigung für diese Aktion.");
  }
}

/**
 * Ensures the caller has an active organization and returns its id.
 *
 * This is the one place edition behaviour diverges:
 *  - self-hosted: the first sign-in bootstraps the single org (that user becomes
 *    its owner). Later sign-ins that arrive through Microsoft Entra ID join that
 *    same org as members — see joinOrCreateSelfHostOrg.
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
    orgId = await joinOrCreateSelfHostOrg(session.user.id, h, listOwn);
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
 * Self-host org bootstrap for a user who has no organization yet.
 *
 * Same-tenant → same-org: a self-host instance is single-tenant (the Entra
 * `ENTRA_TENANT_ID` lock, and typically a single company), so its primary org
 * *is* the tenant's org. A user who signed in via Entra therefore joins that
 * existing org as a member instead of getting a private one — a whole company
 * lands in one tenant. This is gated on an actual Microsoft account so open
 * email/password signups still get their own org and can't auto-join a
 * stranger's data. When no org exists yet, the caller is the first user and
 * bootstraps the org as its owner (either sign-in path).
 */
async function joinOrCreateSelfHostOrg(
  userId: string,
  h: Awaited<ReturnType<typeof headers>>,
  listOwn: () => ReturnType<typeof auth.api.listOrganizations>,
): Promise<string | null> {
  const viaEntra = await prisma.account.findFirst({
    where: { userId, providerId: "microsoft" },
    select: { id: true },
  });

  if (viaEntra) {
    // The instance's primary org is the oldest *adopted* org — oldest that has
    // at least one member. Requiring a member skips a seeded/demo org that no
    // human belongs to, so Entra users land in the real company org.
    const primary = await prisma.organization.findFirst({
      where: { members: { some: {} } },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (primary) {
      try {
        await prisma.member.create({
          data: { id: randomUUID(), organizationId: primary.id, userId, role: "member" },
        });
      } catch {
        // Already a member (unique organizationId+userId) — a concurrent
        // request won the race. Nothing to do.
      }
      return primary.id;
    }
  }

  // First user on the instance (or an email/password signup): create their org.
  try {
    const created = await auth.api.createOrganization({
      body: { name: "Mein Unternehmen", slug: `org-${userId.slice(0, 12)}` },
      headers: h,
    });
    return created?.id ?? null;
  } catch {
    // A concurrent request may have created it first (unique slug) — re-read.
    return (await listOwn())?.[0]?.id ?? null;
  }
}

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
