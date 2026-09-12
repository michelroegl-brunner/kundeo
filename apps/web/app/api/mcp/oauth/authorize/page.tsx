import { redirect } from "next/navigation";
import { prisma } from "@kundeo/db";
import { getSession, ensureActiveOrgId } from "@/lib/session";
import { validateAuthorizeClient, resolveScope, OAuthError, type McpScope } from "@/lib/mcp/oauth";
import { AuthorizeConsent } from "@/components/mcp/authorize-consent";
import { AuthorizeError } from "@/components/mcp/authorize-error";

export const dynamic = "force-dynamic";

interface Params {
  response_type?: string;
  client_id?: string;
  redirect_uri?: string;
  scope?: string;
  state?: string;
  code_challenge?: string;
  code_challenge_method?: string;
}

function authorizeUrl(p: Params): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v) params.set(k, v);
  return `/api/mcp/oauth/authorize?${params.toString()}`;
}

export default async function AuthorizePage({ searchParams }: { searchParams: Promise<Params> }) {
  const p = await searchParams;
  const { client_id, redirect_uri } = p;

  if (!client_id || !redirect_uri) {
    return <AuthorizeError message="Ungültige Anfrage: client_id und redirect_uri sind erforderlich." />;
  }

  // Validate the client and redirect URI *before* the browser is ever sent back.
  let clientName: string;
  try {
    const client = await validateAuthorizeClient(client_id, redirect_uri);
    clientName = client.clientName;
  } catch {
    return <AuthorizeError message="Unbekannter Client oder nicht registrierte redirect_uri." />;
  }

  // From here the redirect_uri is trusted, so recoverable errors go back to it.
  const back = new URL(redirect_uri);
  if (p.state) back.searchParams.set("state", p.state);
  const fail = (error: string): never => {
    back.searchParams.set("error", error);
    redirect(back.toString());
  };

  if (p.response_type !== "code") fail("unsupported_response_type");
  if (!p.code_challenge) fail("invalid_request");
  if ((p.code_challenge_method ?? "S256") !== "S256") fail("invalid_request");

  let scope: McpScope;
  try {
    scope = resolveScope(p.scope);
  } catch (err) {
    return fail(err instanceof OAuthError ? err.code : "invalid_scope");
  }

  // Require a signed-in user; bounce through login and return here afterwards.
  const session = await getSession();
  if (!session) redirect(`/login?redirect=${encodeURIComponent(authorizeUrl(p))}`);

  const orgId = await ensureActiveOrgId();
  if (!orgId) {
    return <AuthorizeError message="Keine aktive Organisation. Bitte zuerst in Kundeo eine Organisation wählen." />;
  }
  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { name: true } });

  return (
    <AuthorizeConsent
      clientName={clientName}
      orgName={org?.name ?? "diese Organisation"}
      userEmail={session!.user.email}
      scope={scope}
      params={{
        response_type: "code",
        client_id,
        redirect_uri,
        scope: p.scope ?? "",
        state: p.state ?? "",
        code_challenge: p.code_challenge ?? "",
        code_challenge_method: p.code_challenge_method ?? "S256",
      }}
    />
  );
}
