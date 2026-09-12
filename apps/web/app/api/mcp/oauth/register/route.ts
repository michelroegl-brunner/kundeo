import { NextResponse } from "next/server";
import { registerClient, OAuthError } from "@/lib/mcp/oauth";

// RFC 7591 — dynamic client registration. Open by design: an MCP client
// registers itself before the user authorizes it. No credentials are granted
// until a human approves the authorization request against their session.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "Authorization, Content-Type",
};

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_client_metadata" }, { status: 400, headers: CORS });
  }
  try {
    const client = await registerClient(body);
    return NextResponse.json(client, { status: 201, headers: CORS });
  } catch (err) {
    if (err instanceof OAuthError) {
      return NextResponse.json(err.toBody(), { status: err.status, headers: CORS });
    }
    console.error("[mcp-oauth] register failed", err);
    return NextResponse.json({ error: "server_error" }, { status: 500, headers: CORS });
  }
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}
