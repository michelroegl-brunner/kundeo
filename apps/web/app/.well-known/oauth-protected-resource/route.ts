import { NextResponse } from "next/server";
import { protectedResourceMetadata } from "@/lib/mcp/oauth";

// RFC 9728 — tells MCP clients which authorization server protects /api/mcp.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "Authorization, Content-Type",
};

export function GET(req: Request) {
  return NextResponse.json(protectedResourceMetadata(req), { headers: CORS });
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}
