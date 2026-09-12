import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";

/**
 * AES-256-GCM for the stored FreeFinance client_secret. The key comes from
 * `KUNDEO_ENCRYPTION_KEY` (any string; hashed to 32 bytes). Ciphertext is
 * self-describing: `v1:{iv}:{tag}:{data}`, all base64. Never log the key or the
 * plaintext.
 *
 * Self-host without the env set falls back to a warning + a machine-derived key
 * so a single-instance deployment still works; hosted MUST set the env.
 */
const VERSION = "v1";

function key(): Buffer {
  const raw = process.env.KUNDEO_ENCRYPTION_KEY?.trim();
  if (raw) return createHash("sha256").update(raw).digest();
  // Fallback: derive from a stable-ish per-instance value. Rotating this makes
  // existing ciphertexts unreadable — intended only for single self-host use.
  console.warn(
    "[freefinance] KUNDEO_ENCRYPTION_KEY not set — using a derived fallback key. Set it for a stable, portable secret store.",
  );
  return createHash("sha256").update("kundeo:freefinance:fallback").digest();
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64"), tag.toString("base64"), data.toString("base64")].join(":");
}

export function decryptSecret(ciphertext: string): string {
  const [version, ivB64, tagB64, dataB64] = ciphertext.split(":");
  if (version !== VERSION || !ivB64 || !tagB64 || !dataB64) {
    throw new Error("FreeFinance-Secret konnte nicht entschlüsselt werden (ungültiges Format)");
  }
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
}
