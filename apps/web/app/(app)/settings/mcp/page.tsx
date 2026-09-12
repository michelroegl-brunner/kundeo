import { activeOrgRole } from "@/lib/session";
import { listMcpKeys } from "@/app/(app)/settings/mcp-actions";
import { McpKeysView } from "@/components/settings/mcp-keys-view";

export const dynamic = "force-dynamic";

export default async function McpSettingsPage() {
  const [keys, role] = await Promise.all([listMcpKeys(), activeOrgRole()]);
  const canManage = role === "admin" || role === "owner";

  // The public endpoint agents connect to. Falls back to a relative path when
  // BETTER_AUTH_URL is unset (dev), which still resolves against the host.
  const base = process.env.BETTER_AUTH_URL?.replace(/\/+$/, "") ?? "";
  const endpoint = `${base}/api/mcp`;

  return <McpKeysView keys={keys} canManage={canManage} endpoint={endpoint} />;
}
