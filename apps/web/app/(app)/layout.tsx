import { redirect } from "next/navigation";
import { auth } from "@kundeo/auth";
import { headers } from "next/headers";
import { getSession, ensureActiveOrgId } from "@/lib/session";
import { AppShell } from "@/components/app-shell";
import { isFreeFinanceConnected } from "@/lib/freefinance";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const orgId = await ensureActiveOrgId();
  if (!orgId) {
    // Hosted edition with no org yet → onboarding (not built in the MVP).
    redirect("/login");
  }

  const [orgs, freeFinanceConnected] = await Promise.all([
    auth.api.listOrganizations({ headers: await headers() }),
    isFreeFinanceConnected(orgId).catch(() => false),
  ]);
  const org = orgs?.find((o) => o.id === orgId);

  return (
    <AppShell
      user={{ name: session.user.name, email: session.user.email }}
      org={{ name: org?.name ?? "Arbeitsbereich", slug: org?.slug ?? "" }}
      freeFinanceConnected={freeFinanceConnected}
    >
      {children}
    </AppShell>
  );
}
