import { NextResponse } from "next/server";
import { authenticateMcp } from "@/lib/mcp/auth";
import { dispatchMcp, PARSE_ERROR_RESPONSE } from "@/lib/mcp/server";

/**
 * MCP (Model Context Protocol) endpoint — Streamable HTTP transport.
 *
 * External agents (Claude Cowork, Claude Desktop, …) connect here with a
 * per-organization bearer key and drive the Kundeo CRM through the tools in
 * lib/mcp/tools.ts. Responses are single JSON messages (no SSE), which keeps the
 * endpoint stateless and dependency-free for self-hosting.
 *
 * Needs Node (crypto + Prisma), and must never be cached.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unauthorized() {
  return new NextResponse(
    JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32001, message: "Unauthorized" } }),
    {
      status: 401,
      headers: {
        "content-type": "application/json",
        "www-authenticate": 'Bearer realm="kundeo-mcp"',
      },
    },
  );
}

export async function POST(req: Request) {
  const ctx = await authenticateMcp(req);
  if (!ctx) return unauthorized();

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json(PARSE_ERROR_RESPONSE, { status: 400 });
  }

  const { status, body } = await dispatchMcp(payload, ctx);
  if (body === null) return new NextResponse(null, { status });
  return NextResponse.json(body, { status });
}

// This transport does not offer a server-initiated SSE stream, so a GET (which
// clients use to open one) is simply not allowed — they fall back to POST.
export function GET() {
  return new NextResponse("Method Not Allowed", {
    status: 405,
    headers: { allow: "POST" },
  });
}
