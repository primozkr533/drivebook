import { hash, verify } from "@node-rs/argon2";

// Algorithm is an ambient const enum, unusable under isolatedModules.
const ARGON2ID = 2;

export const PASSWORD_MIN_LENGTH = 10;

export function hashPassword(plain: string): Promise<string> {
  return hash(plain, { algorithm: ARGON2ID });
}

export async function verifyPassword(hashed: string, plain: string): Promise<boolean> {
  try {
    return await verify(hashed, plain);
  } catch {
    return false;
  }
}

export function validateNewPassword(plain: string): "too_short" | null {
  return [...plain].length < PASSWORD_MIN_LENGTH ? "too_short" : null;
}
