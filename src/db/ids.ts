import { randomBytes } from "node:crypto";

const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const LENGTH = 16;
// Largest multiple of 62 below 256; bytes above it are rejected to avoid modulo bias.
const LIMIT = 248;

export function newPublicId(): string {
  let id = "";
  while (id.length < LENGTH) {
    for (const byte of randomBytes(LENGTH * 2)) {
      if (byte >= LIMIT) continue;
      id += ALPHABET[byte % 62];
      if (id.length === LENGTH) break;
    }
  }
  return id;
}
