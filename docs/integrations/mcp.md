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

## Authentication

Two ways to authenticate, both org-scoped and both resolved through the single
`authenticateMcp()` seam:

1. **OAuth 2.1 (recommended for remote agents)** — the client discovers the
   server and runs the standard authorization flow; the user approves it in a
   consent screen. No token is ever pasted by hand. See below.
2. **Manual bearer keys** — a self-host convenience: create a key in the UI and
   hand it to the client. See *Bearer keys*.

An access token from either path is sent the same way:
`Authorization: Bearer <token>`. OAuth access tokens (`kundeo_mcp_at_…`) are
tried first; manual keys (`kundeo_mcp_…`) are the fallback.

## OAuth 2.1 (discovery flow)

A minimal in-app authorization server implements exactly what MCP clients need:

- **Protected-resource metadata** (RFC 9728) at
  `/.well-known/oauth-protected-resource`, advertised in the `401`
  `WWW-Authenticate: Bearer … resource_metadata="…"` header from `/api/mcp`.
- **Authorization-server metadata** (RFC 8414) at
  `/.well-known/oauth-authorization-server`.
- **Dynamic client registration** (RFC 7591) at `POST /api/mcp/oauth/register`.
- **Authorization endpoint** at `/api/mcp/oauth/authorize` — reuses the user's
  Better Auth session (bouncing through `/login` if needed) and shows a consent
  screen that binds the grant to the user's **active organization**. Requires
  **PKCE (S256)**.
- **Token endpoint** at `/api/mcp/oauth/token` — `authorization_code` (with PKCE
  verification) and `refresh_token` (rotating) grants. Access tokens live 1 hour,
  refresh tokens 30 days.

The flow a client runs:

```
GET  /api/mcp                       → 401 + resource_metadata
GET  /.well-known/oauth-protected-resource   → authorization_servers
GET  /.well-known/oauth-authorization-server → endpoints
POST /api/mcp/oauth/register        → client_id (public, PKCE)
open /api/mcp/oauth/authorize?…     → user consents → redirect ?code=…
POST /api/mcp/oauth/token           → access_token + refresh_token
POST /api/mcp   (Bearer access_token)
```

Scopes map to access levels: `crm:read` → read-only, `crm:read crm:write` →
read/write. Connected clients are listed under *Einstellungen → Integrationen →
MCP-Zugriff* and can be revoked there at any time (revocation is immediate).

Security notes: authorization codes are single-use and PKCE-bound (reuse revokes
the tokens derived from them); refresh tokens rotate on use; all client secrets,
codes and tokens are stored only as SHA-256 hashes; `redirect_uri` must match a
registered URI exactly.

## Bearer keys

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

**OAuth-capable clients** (Claude Cowork, claude.ai connectors) need only the
endpoint URL — they discover everything else and walk you through consent:

```
https://your-kundeo.example.com/api/mcp
```

**Manual bearer keys** work with any client that speaks Streamable HTTP. Example
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
  identity is resolved — OAuth access tokens and manual keys both flow through
  it, and the protocol handler (`lib/mcp/server.ts`) and tools
  (`lib/mcp/tools.ts`) never see how the caller authenticated.
- **Stateless by choice.** No `Mcp-Session-Id`, no SSE — the simplest thing that
  serves tool-using clients and needs nothing extra to self-host.
- **Additive.** No core tables or flows changed: new auth-infra tables, routes,
  and one settings screen. With nothing connected, the feature is inert. The
  OAuth server reuses the existing Better Auth session for the human step, so no
  password handling was added.
