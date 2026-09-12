import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";

/**
 * AES-256-GCM for the stored FreeFinance client_secret. The key comes from
 * `KUNDEO_ENCRYPTION_KEY` (any string; hashed to 32 bytes). Ciphertext is
 * self-describing: `v1:{iv}:{tag}:{data}`, all base64. Never log the key or the
 * plaintext.
 *
 * There is no fallback key: if the env is unset we fail closed rather than
 * encrypt under a source-code constant (which, in an open-source build, is a
 * globally-known key and would leave the secret effectively plaintext). Both
 * self-host and hosted MUST set `KUNDEO_ENCRYPTION_KEY` before storing DB-backed
 * credentials. Env-pinned FreeFinance credentials never reach this module.
 */
const VERSION = "v1";

function key(): Buffer {
  const raw = process.env.KUNDEO_ENCRYPTION_KEY?.trim();
  if (raw) return createHash("sha256").update(raw).digest();
  throw new Error(
    "KUNDEO_ENCRYPTION_KEY ist nicht gesetzt. Setze einen zufälligen Wert (z. B. `openssl rand -base64 32`), um FreeFinance-Zugangsdaten verschlüsselt zu speichern.",
  );
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
