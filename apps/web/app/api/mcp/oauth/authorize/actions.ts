"use server";

import { redirect } from "next/navigation";
import { getSession, ensureActiveOrgId } from "@/lib/session";
import {
  validateAuthorizeClient,
  issueAuthCode,
  resolveScope,
  OAuthError,
} from "@/lib/mcp/oauth";

/**
 * Finalize an authorization request. Everything security-critical is taken from
 * the server session (userId) and re-validated against the DB (client,
 * redirect_uri) — never trusted from the submitted form. The user's active
 * organization is the tenant the issued token will be bound to.
 */
export async function decideAuthorization(formData: FormData): Promise<void> {
  const get = (k: string) => {
    const v = formData.get(k);
    return typeof v === "string" ? v : "";
  };

  const approve = get("decision") === "approve";
  const clientId = get("client_id");
  const redirectUri = get("redirect_uri");
  const state = get("state");
  const codeChallenge = get("code_challenge");
  const codeChallengeMethod = get("code_challenge_method") || "S256";
  const scopeParam = get("scope");

  // Re-validate the client/redirect before we send the browser anywhere.
  await validateAuthorizeClient(clientId, redirectUri);

  const back = new URL(redirectUri);
  if (state) back.searchParams.set("state", state);

  if (!approve) {
    back.searchParams.set("error", "access_denied");
    redirect(back.toString());
  }

  const session = await getSession();
  if (!session) redirect(`/login?redirect=${encodeURIComponent(authorizePath(formData))}`);

  const orgId = await ensureActiveOrgId();
  if (!orgId) {
    back.searchParams.set("error", "access_denied");
    back.searchParams.set("error_description", "No active organization");
    redirect(back.toString());
  }

  let scope;
  try {
    scope = resolveScope(scopeParam);
  } catch (err) {
    back.searchParams.set("error", err instanceof OAuthError ? err.code : "invalid_scope");
    redirect(back.toString());
  }

  const code = await issueAuthCode({
    clientId,
    userId: session!.user.id,
    organizationId: orgId!,
    redirectUri,
    scope: scope!,
    codeChallenge,
    codeChallengeMethod,
  });

  back.searchParams.set("code", code);
  redirect(back.toString());
}

/** Rebuild the authorize URL (for the login round-trip) from the form params. */
function authorizePath(formData: FormData): string {
  const params = new URLSearchParams();
  for (const k of [
    "response_type",
    "client_id",
    "redirect_uri",
    "scope",
    "state",
    "code_challenge",
    "code_challenge_method",
  ]) {
    const v = formData.get(k);
    if (typeof v === "string" && v) params.set(k, v);
  }
  return `/api/mcp/oauth/authorize?${params.toString()}`;
}
