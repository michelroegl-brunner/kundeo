import { NextResponse } from "next/server";
import {
  exchangeAuthorizationCode,
  refreshAccessToken,
  OAuthError,
  type TokenResponse,
} from "@/lib/mcp/oauth";

// OAuth 2.1 token endpoint — authorization_code (with PKCE) and refresh_token.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "Authorization, Content-Type",
};

/** Accept form-encoded (the OAuth default) or JSON bodies. */
async function readParams(req: Request): Promise<Record<string, string>> {
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    const j = (await req.json()) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(j).map(([k, v]) => [k, String(v)]));
  }
  const form = await req.formData();
  const out: Record<string, string> = {};
  for (const [k, v] of form.entries()) out[k] = String(v);
  return out;
}

/** client_secret_basic — credentials in the Authorization header. */
function basicAuth(req: Request): { id: string; secret: string } | null {
  const h = req.headers.get("authorization");
  const m = h ? /^Basic\s+(.+)$/i.exec(h.trim()) : null;
  if (!m?.[1]) return null;
  try {
    const [id, secret] = Buffer.from(m[1], "base64").toString("utf8").split(":");
    if (!id) return null;
    return { id: decodeURIComponent(id), secret: decodeURIComponent(secret ?? "") };
  } catch {
    return null;
  }
}

function json(body: unknown, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { ...CORS, "cache-control": "no-store", pragma: "no-cache" },
  });
}

export async function POST(req: Request) {
  let params: Record<string, string>;
  try {
    params = await readParams(req);
  } catch {
    return json({ error: "invalid_request" }, 400);
  }

  const basic = basicAuth(req);
  const clientId = basic?.id ?? params.client_id ?? "";
  const clientSecret = basic?.secret ?? params.client_secret;
  if (!clientId) return json({ error: "invalid_client", error_description: "client_id is required" }, 401);

  try {
    let tokens: TokenResponse;
    switch (params.grant_type) {
      case "authorization_code":
        tokens = await exchangeAuthorizationCode({
          code: params.code ?? "",
          redirectUri: params.redirect_uri ?? "",
          clientId,
          clientSecret,
          codeVerifier: params.code_verifier ?? "",
        });
        break;
      case "refresh_token":
        tokens = await refreshAccessToken({
          refreshToken: params.refresh_token ?? "",
          clientId,
          clientSecret,
        });
        break;
      default:
        return json({ error: "unsupported_grant_type" }, 400);
    }
    return json(tokens, 200);
  } catch (err) {
    if (err instanceof OAuthError) return json(err.toBody(), err.status);
    console.error("[mcp-oauth] token failed", err);
    return json({ error: "server_error" }, 500);
  }
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}
