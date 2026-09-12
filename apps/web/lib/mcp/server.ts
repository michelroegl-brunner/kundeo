import "server-only";
import { withOrg } from "@kundeo/db";
import { dispatchSystemEvent } from "@/lib/automations/events";
import type { McpContext } from "./auth";
import { TOOLS, TOOLS_BY_NAME, ToolInputError, type ToolDef } from "./tools";

/**
 * A minimal, spec-accurate MCP server over JSON-RPC 2.0 for the Streamable HTTP
 * transport. Every tool call returns a single JSON response — we do not stream,
 * so the endpoint stays a stateless Next.js route with no session store, which
 * is exactly what a self-hosted single instance wants.
 *
 * Implements: initialize, tools/list, tools/call, ping, and the initialized
 * notification. That is the whole surface a tool-using client (Claude Cowork,
 * Claude Desktop, …) needs.
 */

const SERVER_INFO = { name: "kundeo-crm", version: "1.0.0" } as const;

/** Protocol revisions we understand; we echo the client's if it is one of these. */
const SUPPORTED_PROTOCOL = ["2025-06-18", "2025-03-26", "2024-11-05"];
const LATEST_PROTOCOL = SUPPORTED_PROTOCOL[0];

// JSON-RPC 2.0 error codes.
const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INTERNAL_ERROR = -32603;

type Id = string | number | null;

interface RpcError {
  code: number;
  message: string;
}

interface RpcResponse {
  jsonrpc: "2.0";
  id: Id;
  result?: unknown;
  error?: RpcError;
}

function result(id: Id, value: unknown): RpcResponse {
  return { jsonrpc: "2.0", id, result: value };
}

function error(id: Id, code: number, message: string): RpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function visibleTools(ctx: McpContext): ToolDef[] {
  // A read-only key never sees write tools, so an agent won't attempt them.
  return ctx.scope === "read_only" ? TOOLS.filter((t) => !t.write) : TOOLS;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Run one tool call end to end: withOrg (RLS) → handler → dispatch events. */
async function callTool(ctx: McpContext, name: string, args: Record<string, unknown>) {
  const tool = TOOLS_BY_NAME.get(name);
  if (!tool) throw new ToolInputError(`Unknown tool: ${name}`);
  if (tool.write && ctx.scope !== "read_write") {
    throw new ToolInputError(`Tool "${name}" requires a read/write key`);
  }

  const { text, events } = await withOrg(ctx.organizationId, (tx) => tool.handler(tx, ctx, args));

  // Fire automation triggers after the write commits, never blocking on them.
  if (events?.length) {
    for (const e of events) {
      try {
        await dispatchSystemEvent(ctx.organizationId, e.kind, e.record, e.meta);
      } catch (err) {
        console.error("[mcp] automation dispatch failed", err);
      }
    }
  }
  return text;
}

/** Handle a single JSON-RPC message. Returns null for notifications. */
async function handleOne(msg: unknown, ctx: McpContext): Promise<RpcResponse | null> {
  if (!isRecord(msg) || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
    return error((isRecord(msg) ? (msg.id as Id) : null) ?? null, INVALID_REQUEST, "Invalid Request");
  }
  const id = (msg.id as Id) ?? null;
  const isNotification = !("id" in msg);
  const method = msg.method;
  const params = isRecord(msg.params) ? msg.params : {};

  // Notifications (no id) never get a response.
  if (isNotification) {
    return null;
  }

  switch (method) {
    case "initialize": {
      const requested = typeof params.protocolVersion === "string" ? params.protocolVersion : "";
      const protocolVersion = SUPPORTED_PROTOCOL.includes(requested) ? requested : LATEST_PROTOCOL;
      return result(id, {
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions:
          "Kundeo CRM. Tools operate on the authenticated organization only. Amounts are integer minor units (cents). Call list_pipelines before create_deal to obtain valid pipelineId/stageId.",
      });
    }
    case "ping":
      return result(id, {});
    case "tools/list":
      return result(id, {
        tools: visibleTools(ctx).map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
      });
    case "tools/call": {
      const name = typeof params.name === "string" ? params.name : "";
      const args = isRecord(params.arguments) ? params.arguments : {};
      try {
        const text = await callTool(ctx, name, args);
        return result(id, { content: [{ type: "text", text }], isError: false });
      } catch (err) {
        // Business/validation errors are returned as a tool error result (so the
        // model can read and react to them), not a JSON-RPC protocol error.
        const message = err instanceof Error ? err.message : "Tool execution failed";
        if (!(err instanceof ToolInputError)) console.error(`[mcp] tool ${name} failed`, err);
        return result(id, { content: [{ type: "text", text: message }], isError: true });
      }
    }
    default:
      return error(id, METHOD_NOT_FOUND, `Method not found: ${method}`);
  }
}

export interface McpHttpResponse {
  status: number;
  body: RpcResponse | RpcResponse[] | null;
}

/**
 * Dispatch a parsed request body (single message or a JSON-RPC batch) and
 * produce the HTTP status + JSON body the route should return. A body that is
 * only notifications yields 202 with no content.
 */
export async function dispatchMcp(payload: unknown, ctx: McpContext): Promise<McpHttpResponse> {
  if (Array.isArray(payload)) {
    if (payload.length === 0) return { status: 400, body: error(null, INVALID_REQUEST, "Empty batch") };
    const responses = (await Promise.all(payload.map((m) => handleOne(m, ctx)))).filter(
      (r): r is RpcResponse => r !== null,
    );
    return responses.length ? { status: 200, body: responses } : { status: 202, body: null };
  }

  const response = await handleOne(payload, ctx);
  return response ? { status: 200, body: response } : { status: 202, body: null };
}

export const PARSE_ERROR_RESPONSE: RpcResponse = error(null, PARSE_ERROR, "Parse error");
export { INTERNAL_ERROR };
