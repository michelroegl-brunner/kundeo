import { headers } from "next/headers";
import { auth } from "@kundeo/auth";
import { getSession, ensureActiveOrgId, scoped } from "@/lib/session";
import { formatDate } from "@/lib/format";
import { TeamView, type InvitationRow, type MemberRow } from "@/components/team/team-view";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const h = await headers();
  const [session, orgId] = await Promise.all([getSession(), ensureActiveOrgId()]);

  const [membersRes, invitationsRes, orgs, dealCounts] = await Promise.all([
    auth.api.listMembers({ query: orgId ? { organizationId: orgId } : {}, headers: h }),
    auth.api.listInvitations({ query: orgId ? { organizationId: orgId } : undefined, headers: h }),
    auth.api.listOrganizations({ headers: h }),
    scoped((db) => db.deal.groupBy({ by: ["ownerId"], _count: { _all: true } })),
  ]);

  const dealsByOwner = new Map<string, number>();
  for (const g of dealCounts) if (g.ownerId) dealsByOwner.set(g.ownerId, g._count._all);

  const orgName = orgs?.find((o) => o.id === orgId)?.name ?? "Arbeitsbereich";

  const members: MemberRow[] = membersRes.members.map((m) => ({
    id: m.id,
    userId: m.userId,
    name: m.user.name,
    email: m.user.email,
    role: m.role,
    deals: dealsByOwner.get(m.userId) ?? 0,
    since: formatDate(m.createdAt),
  }));

  const invitations: InvitationRow[] = invitationsRes
    .filter((i) => i.status === "pending")
    .map((i) => ({
      id: i.id,
      email: i.email,
      role: i.role ?? "member",
      expires: formatDate(i.expiresAt),
    }));

  return (
    <TeamView
      orgName={orgName}
      currentUserId={session?.user.id ?? ""}
      members={members}
      invitations={invitations}
    />
  );
}
