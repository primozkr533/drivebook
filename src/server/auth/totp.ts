import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { and, eq, isNull, lt, or } from "drizzle-orm";
import { generateSecret, generateURI, verifySync } from "otplib";
import QRCode from "qrcode";
import { backofficeUsers, dealerUsers } from "@/db/schema";
import { getConfig } from "@/lib/config";
import { db } from "@/server/data/db";
import type { AuthSurface } from "./session";

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

export function verifyTotpCode(secret: string, code: string, now = Date.now()): number | null {
  const token = code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(token)) return null;
  try {
    const result = verifySync({ secret, token, epoch: Math.floor(now / 1000), epochTolerance: TOTP_PERIOD_SECONDS });
    return result.valid && "timeStep" in result ? result.timeStep : null;
  } catch {
    return null;
  }
}

// A conditional update so two concurrent requests can't both accept the same code.
export async function consumeTotpStep(surface: AuthSurface, userId: string, step: number): Promise<boolean> {
  const users = surface === "dealer" ? dealerUsers : backofficeUsers;
  const rows = await db()
    .update(users)
    .set({ totpLastStep: step })
    .where(and(eq(users.id, userId), or(isNull(users.totpLastStep), lt(users.totpLastStep, step))))
    .returning({ id: users.id });
  return rows.length > 0;
}

export async function acceptTotpCode(
  surface: AuthSurface,
  userId: string,
  secret: string,
  code: string,
): Promise<boolean> {
  const step = verifyTotpCode(secret, code);
  return step !== null && consumeTotpStep(surface, userId, step);
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
