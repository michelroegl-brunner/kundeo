import { activeOrgRole } from "@/lib/session";
import { listMcpKeys, listMcpConnections } from "@/app/(app)/settings/mcp-actions";
import { McpKeysView } from "@/components/settings/mcp-keys-view";

export const dynamic = "force-dynamic";

export default async function McpSettingsPage() {
  const [keys, connections, role] = await Promise.all([
    listMcpKeys(),
    listMcpConnections(),
    activeOrgRole(),
  ]);
  const canManage = role === "admin" || role === "owner";

  // The public endpoint agents connect to. Falls back to a relative path when
  // BETTER_AUTH_URL is unset (dev), which still resolves against the host.
  const base = process.env.BETTER_AUTH_URL?.replace(/\/+$/, "") ?? "";
  const endpoint = `${base}/api/mcp`;

  return (
    <McpKeysView
      keys={keys}
      connections={connections}
      canManage={canManage}
      endpoint={endpoint}
    />
  );
}
