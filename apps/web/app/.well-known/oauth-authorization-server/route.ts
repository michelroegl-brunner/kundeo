import { NextResponse } from "next/server";
import { authorizationServerMetadata } from "@/lib/mcp/oauth";

// RFC 8414 — authorization server metadata (authorize/token/register endpoints).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "Authorization, Content-Type",
};

export function GET(req: Request) {
  return NextResponse.json(authorizationServerMetadata(req), { headers: CORS });
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}
