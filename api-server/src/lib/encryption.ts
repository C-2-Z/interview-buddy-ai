/**
 * AES-256-GCM encryption for storing user API keys at rest.
 * Keys are encrypted before being written to the database and decrypted
 * only when needed for AI calls.
 *
 * Requires ENCRYPTION_KEY environment variable — a 64-character hex string
 * (32 bytes = 256 bits). Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 */

import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex) {
    throw new Error(
      "Missing ENCRYPTION_KEY — set a 64-char hex key in .env",
    );
  }
  const key = Buffer.from(hex, "hex");
  if (key.length !== 32) {
    throw new Error("ENCRYPTION_KEY must be 64 hex chars (32 bytes)");
  }
  return key;
}

/**
 * Encrypt a plaintext string.
 * Returns a colon-delimited string: iv:authTag:ciphertext (all hex).
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

/**
 * Decrypt a string previously produced by `encrypt`.
 */
export function decrypt(
  encryptedText: string,
): string {
  const key = getKey();
  const parts = encryptedText.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted text format");
  }
  const iv = Buffer.from(parts[0], "hex");
  const tag = Buffer.from(parts[1], "hex");
  const ciphertext = Buffer.from(parts[2], "hex");
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(ciphertext) + decipher.final("utf8");
}

/**
 * Return a masked version of a plaintext key for frontend display.
 * Shows first 8 chars + "..." + last 4 chars.
 * Returns null for empty/null input.
 */
export function maskApiKey(plaintext: string | null): string | null {
  if (!plaintext || plaintext.length < 12) return null;
  return `${plaintext.slice(0, 8)}...${plaintext.slice(-4)}`;
}

/**
 * Determine which provider an encrypted key belongs to by its column name suffix.
 */
export function providerFromColumn(col: string): string {
  return col.replace("_api_key", "");
}
