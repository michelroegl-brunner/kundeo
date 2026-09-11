/**
 * SSRF guard for automation webhooks. A webhook URL is authored by an org member
 * and fetched server-side, so it must not be allowed to reach internal targets
 * (cloud metadata at 169.254.169.254, loopback, RFC1918, link-local, ULA, …).
 *
 * Two modes:
 *  - If KUNDEO_WEBHOOK_ALLOWED_HOSTS is set (comma-separated hosts), only those
 *    hosts are permitted — the operator vouches for them.
 *  - Otherwise every resolved address of the host is checked and any internal
 *    range is rejected.
 *
 * Residual TOCTOU: DNS could change between this check and the fetch. Callers
 * also pass redirect:"manual" so a 3xx can't bounce to an internal host. An
 * allowlist closes the gap entirely for operators who need it.
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

function ipv4Blocked(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = p as [number, number, number, number];
  if (a === 0) return true; // 0.0.0.0/8 "this network"
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local incl. 169.254.169.254 metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
  if (a === 192 && b === 0) return true; // 192.0.0.0/24 (IETF protocol assignments)
  if (a >= 224) return true; // multicast 224/4 + reserved 240/4
  return false;
}

function ipv6Blocked(ip: string): boolean {
  const s = ip.toLowerCase();
  if (s === "::1" || s === "::") return true; // loopback / unspecified
  // IPv4-mapped ::ffff:a.b.c.d — validate the embedded v4.
  const mapped = s.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped && mapped[1]) return ipv4Blocked(mapped[1]);
  const head = s.split(":")[0] ?? "";
  if (head.startsWith("fc") || head.startsWith("fd")) return true; // fc00::/7 unique-local
  // fe80::/10 link-local → fe8, fe9, fea, feb prefixes
  if (/^fe[89ab]/.test(head)) return true;
  return false;
}

function ipBlocked(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) return ipv4Blocked(ip);
  if (kind === 6) return ipv6Blocked(ip);
  return true; // not a parseable IP → block
}

/**
 * Throw if `raw` is not a public http(s) URL safe to fetch server-side.
 * Returns the parsed URL when allowed.
 */
export async function assertPublicHttpUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Ungültige URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Nur http/https erlaubt");
  }

  // Normalise: lowercase, strip a fully-qualified trailing dot, and unwrap an
  // IPv6 literal's brackets so the checks below see the bare host.
  const host = url.hostname.toLowerCase().replace(/\.$/, "").replace(/^\[|\]$/g, "");

  const allow = (process.env.KUNDEO_WEBHOOK_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  if (allow.length) {
    if (!allow.includes(host)) throw new Error("Host nicht in der Allowlist");
    return url;
  }

  if (isIP(host)) {
    if (ipBlocked(host)) throw new Error("Interne Adresse blockiert");
    return url;
  }
  const resolved = await lookup(host, { all: true });
  if (!resolved.length) throw new Error("Host nicht auflösbar");
  for (const r of resolved) {
    if (ipBlocked(r.address)) throw new Error("Interne Adresse blockiert");
  }
  return url;
}
