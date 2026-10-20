import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { generateSecret, generateURI, verifySync } from "otplib";
import QRCode from "qrcode";
import { getConfig } from "@/lib/config";

const TOTP_PERIOD_SECONDS = 30;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const ENCRYPTION_VERSION = "v1";

export function generateTotpSecret(): string {
  return generateSecret();
}

export function totpKeyUri(secret: string, accountEmail: string, issuer = "DriveBook"): string {
  return generateURI({ issuer, label: accountEmail, secret });
}

export function totpQrDataUrl(uri: string): Promise<string> {
  return QRCode.toDataURL(uri, { type: "image/png", errorCorrectionLevel: "M" });
}

export function verifyTotpCode(secret: string, code: string): boolean {
  const token = code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(token)) return false;
  try {
    return verifySync({ secret, token, epochTolerance: TOTP_PERIOD_SECONDS }).valid;
  } catch {
    return false;
  }
}

function encryptionKey(): Buffer {
  return createHash("sha256").update(getConfig().authSecret).digest();
}

export function encryptTotpSecret(secret: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [ENCRYPTION_VERSION, iv, tag, ciphertext]
    .map((part) => (typeof part === "string" ? part : part.toString("base64url")))
    .join(".");
}

export function decryptTotpSecret(enc: string): string {
  const [version, iv, tag, ciphertext, ...rest] = enc.split(".");
  if (version !== ENCRYPTION_VERSION || !iv || !tag || ciphertext === undefined || rest.length > 0) {
    throw new Error("Malformed encrypted TOTP secret");
  }
  const tagBytes = Buffer.from(tag, "base64url");
  if (tagBytes.length !== TAG_BYTES) throw new Error("Malformed encrypted TOTP secret");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"), {
    authTagLength: TAG_BYTES,
  });
  decipher.setAuthTag(tagBytes);
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
}
