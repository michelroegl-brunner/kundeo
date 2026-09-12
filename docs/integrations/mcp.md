# MCP integration (agent access)

Kundeo exposes a remote [Model Context Protocol](https://modelcontextprotocol.io)
server so external AI agents (Claude Cowork, Claude Desktop, custom agents built
on the MCP SDK, …) can read and act on a workspace's CRM data through a
well-defined tool surface.

It is **self-hosted first**: access needs no external service — just a bearer key
created inside Kundeo. It is also **hosting-safe**: a key is bound to a single
organization and every tool call runs through `withOrg()`, so Postgres
Row-Level Security isolates tenants exactly as it does for the app.

## Endpoint

```
POST ${BETTER_AUTH_URL}/api/mcp
Authorization: Bearer kundeo_mcp_…
Content-Type: application/json
```

- **Transport:** Streamable HTTP. Each request is answered with a single JSON
  response (no SSE stream), which keeps the endpoint stateless — no session
  store, nothing to scale for a self-host instance. A `GET` returns `405`
  (there is no server-initiated stream).
- **Protocol revisions:** `2025-06-18` (default), `2025-03-26`, `2024-11-05`.
  The server echoes the client's requested version when it is one of these.
- **Methods:** `initialize`, `tools/list`, `tools/call`, `ping`, and the
  `notifications/initialized` notification. JSON-RPC batches are supported.

## Authentication — bearer keys

Keys are managed under **Einstellungen → Integrationen → MCP-Zugriff** (admin or
owner role required to create or revoke).

- Format `kundeo_mcp_<40 hex>`. The plaintext is shown **once** at creation;
  Kundeo stores only its SHA-256 hash (`mcp_api_key.keyHash`).
- Each key carries a **scope**: `read_write` (default) or `read_only`. A
  read-only key never sees the write tools in `tools/list` and is refused if it
  calls one.
- Revoking a key takes effect immediately (`revokedAt`); the endpoint then
  returns `401` for it. `lastUsedAt` is stamped (throttled) on use.

`mcp_api_key` is auth **infrastructure**, not tenant data: a token must be
resolved to its organization *before* any org context exists, so the lookup runs
on the bare Prisma client — like Better Auth's own `user`/`session`/
`organization` tables. It is therefore deliberately **not** under RLS; the
management UI scopes it explicitly by `organizationId` and gates it on role.
Every query the resolved key then makes into CRM tables still goes through
`withOrg()`, so the actual data access is RLS-enforced.

## Tools

All tools operate on the authenticated organization only. Money is in integer
minor units (cents). Write tools require a `read_write` key.

| Tool | Access | Purpose |
| --- | --- | --- |
| `search_contacts` | read | Search contacts by name/email (or list recent). |
| `get_contact` | read | One contact with company, deals, recent activities. |
| `create_contact` | write | Create a contact (`firstName`, `lastName` required). |
| `update_contact` | write | Patch fields on a contact. |
| `list_companies` | read | List/search companies by name. |
| `create_company` | write | Create a company (`name` required). |
| `list_pipelines` | read | Pipelines with stages — get `pipelineId`/`stageId`. |
| `list_deals` | read | Deals, optionally filtered by status/stage. |
| `get_deal` | read | One deal with stage, company, contact, activities. |
| `create_deal` | write | Create a deal (`title`, `pipelineId`, `stageId` required). |
| `list_activities` | read | Activities, optionally by contact/deal. |
| `create_activity` | write | Log a NOTE/CALL/EMAIL/MEETING/TASK. |

Writes dispatch the same automation triggers as the UI (`contact.created`,
`contact.updated`, `company.created`, `deal.created`, `task.created`) via
`dispatchSystemEvent`, so workflows fire for agent-made changes too.

## Connecting a client

Any MCP client that speaks Streamable HTTP with a bearer token works. Example
`.mcp.json` / client config entry:

```json
{
  "mcpServers": {
    "kundeo": {
      "type": "http",
      "url": "https://your-kundeo.example.com/api/mcp",
      "headers": { "Authorization": "Bearer kundeo_mcp_xxxxxxxx…" }
    }
  }
}
```

Quick manual check with `curl`:

```bash
curl -s https://your-kundeo.example.com/api/mcp \
  -H "Authorization: Bearer $KUNDEO_MCP_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## Design notes

- **Auth is a seam.** `lib/mcp/auth.ts#authenticateMcp` is the single place
  identity is resolved. A hosted edition could add OAuth here without touching
  the protocol handler (`lib/mcp/server.ts`) or the tools (`lib/mcp/tools.ts`).
- **Stateless by choice.** No `Mcp-Session-Id`, no SSE — the simplest thing that
  serves tool-using clients and needs nothing extra to self-host.
- **Additive.** No core tables or flows changed: one new auth-infra table, one
  route, one settings screen. With no keys created, the feature is inert.
