import { generateSync } from "otplib";
import { describe, expect, it } from "vitest";
import {
  hashPassword,
  PASSWORD_MIN_LENGTH,
  validateNewPassword,
  verifyPassword,
} from "@/server/auth/password";
import { hashToken, newOpaqueToken } from "@/server/auth/tokens";
import {
  decryptTotpSecret,
  encryptTotpSecret,
  generateTotpSecret,
  totpKeyUri,
  totpQrDataUrl,
  verifyTotpCode,
} from "@/server/auth/totp";

describe("password", () => {
  it("hashes with argon2id and verifies", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(hash.startsWith("$argon2id$")).toBe(true);
    expect(await verifyPassword(hash, "correct horse battery")).toBe(true);
    expect(await verifyPassword(hash, "wrong password!")).toBe(false);
  });

  it("returns false for a garbage hash instead of throwing", async () => {
    expect(await verifyPassword("not-a-hash", "whatever")).toBe(false);
    expect(await verifyPassword("", "whatever")).toBe(false);
  });

  it("validates the minimum length", () => {
    expect(PASSWORD_MIN_LENGTH).toBe(10);
    expect(validateNewPassword("123456789")).toBe("too_short");
    expect(validateNewPassword("1234567890")).toBeNull();
  });
});

describe("tokens", () => {
  it("creates distinct base64url tokens of at least 43 chars", () => {
    const tokens = new Set(Array.from({ length: 20 }, () => newOpaqueToken()));
    expect(tokens.size).toBe(20);
    for (const token of tokens) {
      expect(token.length).toBeGreaterThanOrEqual(43);
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it("hashes deterministically to sha256 hex", () => {
    expect(hashToken("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(hashToken("abc")).toBe(hashToken("abc"));
    expect(hashToken("abd")).not.toBe(hashToken("abc"));
  });
});

describe("totp", () => {
  it("returns the matched step for the current code, tolerates spacing and rejects a wrong code", () => {
    const secret = generateTotpSecret();
    const now = Date.now();
    const step = Math.floor(now / 1000 / 30);
    const code = generateSync({ secret, epoch: Math.floor(now / 1000) });
    expect(verifyTotpCode(secret, code, now)).toBe(step);
    expect(verifyTotpCode(secret, `${code.slice(0, 3)} ${code.slice(3)}`, now)).toBe(step);
    const wrong = String((Number(code) + 1) % 1_000_000).padStart(6, "0");
    expect(verifyTotpCode(secret, wrong, now)).toBeNull();
    expect(verifyTotpCode(secret, "abc", now)).toBeNull();
  });

  it("returns the neighbouring step for codes one step away and rejects codes two steps away", () => {
    const secret = generateTotpSecret();
    const now = Date.now();
    const seconds = Math.floor(now / 1000);
    const step = Math.floor(seconds / 30);
    expect(verifyTotpCode(secret, generateSync({ secret, epoch: seconds - 30 }), now)).toBe(step - 1);
    expect(verifyTotpCode(secret, generateSync({ secret, epoch: seconds + 30 }), now)).toBe(step + 1);
    expect(verifyTotpCode(secret, generateSync({ secret, epoch: seconds - 90 }), now)).toBeNull();
  });

  it("builds an otpauth URI and a PNG data URL", async () => {
    const uri = totpKeyUri("JBSWY3DPEHPK3PXP", "owner@example.com");
    expect(uri.startsWith("otpauth://totp/")).toBe(true);
    expect(uri).toContain("DriveBook");
    expect(await totpQrDataUrl(uri)).toMatch(/^data:image\/png;base64,/);
  });

  it("round-trips encryption with a fresh ciphertext each call", () => {
    const secret = generateTotpSecret();
    const a = encryptTotpSecret(secret);
    const b = encryptTotpSecret(secret);
    expect(a).not.toBe(b);
    expect(decryptTotpSecret(a)).toBe(secret);
    expect(decryptTotpSecret(b)).toBe(secret);
  });

  it("throws on tampered ciphertext", () => {
    const enc = encryptTotpSecret(generateTotpSecret());
    const parts = enc.split(".");
    const body = Buffer.from(parts[3]!, "base64url");
    body[0] = body[0]! ^ 0xff;
    parts[3] = body.toString("base64url");
    expect(() => decryptTotpSecret(parts.join("."))).toThrow();
    expect(() => decryptTotpSecret("garbage")).toThrow();
  });
});
