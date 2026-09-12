import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * MCP bearer-key primitives.
 *
 * A key is a single opaque secret handed to an external MCP client. We store
 * only its SHA-256 hash; the plaintext is shown once at creation and never
 * again. Format:  kundeo_mcp_<40 hex chars>.
 */

const TOKEN_PREFIX = "kundeo_mcp_";
/** Length of the random hex body (20 bytes → 40 hex chars). */
const TOKEN_BYTES = 20;

export interface GeneratedKey {
  /** The full plaintext token — returned to the user exactly once. */
  token: string;
  /** SHA-256 hash (hex) stored in the DB. */
  keyHash: string;
  /** Non-secret display hint, e.g. "kundeo_mcp_1a2b3c4d". */
  keyPrefix: string;
}

/** Create a fresh token together with its stored hash and display prefix. */
export function generateKey(): GeneratedKey {
  const token = TOKEN_PREFIX + randomBytes(TOKEN_BYTES).toString("hex");
  return {
    token,
    keyHash: hashToken(token),
    keyPrefix: token.slice(0, TOKEN_PREFIX.length + 8),
  };
}

/** SHA-256 (hex) of a token. Deterministic — used for both storage and lookup. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Shape check before we ever touch the database, to reject junk cheaply. */
export function looksLikeToken(value: string): boolean {
  return new RegExp(`^${TOKEN_PREFIX}[0-9a-f]{${TOKEN_BYTES * 2}}$`).test(value);
}

/** Constant-time comparison of two hex hashes of equal length. */
export function hashesEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
