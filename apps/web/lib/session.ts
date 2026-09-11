import { headers } from "next/headers";
import { auth } from "@kundeo/auth";
import { withOrg } from "@kundeo/db";

/**
 * Reads the current Better Auth session on the server. Returns null when the
 * request is unauthenticated.
 */
export async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}

/**
 * Resolves the caller's active organization and runs `fn` inside a
 * tenant-scoped transaction (RLS enforced). Throws if there is no session or no
 * active organization — call sites should have already gated on auth.
 *
 *   const contacts = await scoped((db) => db.contact.findMany());
 */
export async function scoped<T>(
  fn: Parameters<typeof withOrg<T>>[1],
): Promise<T> {
  const session = await getSession();
  const orgId = session?.session.activeOrganizationId;
  if (!session) throw new Error("Not authenticated");
  if (!orgId) throw new Error("No active organization");
  return withOrg(orgId, fn);
}
