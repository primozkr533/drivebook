import { and, count, eq, gte } from "drizzle-orm";
import { loginAttempts } from "@/db/schema";
import { db } from "@/server/data/db";
import type { AuthSurface } from "./session";

export const LOGIN_MAX_ACCOUNT_FAILURES = 5;
export const LOGIN_MAX_IP_FAILURES = 20;
export const LOGIN_RATE_WINDOW_MS = 15 * 60 * 1000;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function isLoginRateLimited(surface: AuthSurface, email: string, ip: string): Promise<boolean> {
  const since = new Date(Date.now() - LOGIN_RATE_WINDOW_MS);
  const failures = (...where: Parameters<typeof and>) =>
    db()
      .select({ n: count() })
      .from(loginAttempts)
      .where(
        and(eq(loginAttempts.surface, surface), eq(loginAttempts.success, false), gte(loginAttempts.createdAt, since), ...where),
      )
      .then(([row]) => row?.n ?? 0);
  const [byAccount, byIp] = await Promise.all([
    failures(eq(loginAttempts.email, normalizeEmail(email))),
    failures(eq(loginAttempts.ip, ip)),
  ]);
  return byAccount >= LOGIN_MAX_ACCOUNT_FAILURES || byIp >= LOGIN_MAX_IP_FAILURES;
}

export async function recordLoginAttempt(
  surface: AuthSurface,
  email: string,
  ip: string,
  success: boolean,
): Promise<void> {
  await db().insert(loginAttempts).values({ surface, email: normalizeEmail(email), ip, success });
}
