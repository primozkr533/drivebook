import { randomUUID } from "node:crypto";
import { eq, inArray, or, type SQL } from "drizzle-orm";
import { generateSync } from "otplib";
import { getDb } from "@/db/client";
import { DEMO_DEALER_SLUG } from "@/db/demo";
import { authTokens, backofficeSessions, backofficeUsers, dealers, dealerSessions, dealerUsers, loginAttempts } from "@/db/schema";
import { hashPassword } from "@/server/auth/password";
import { hashToken, newOpaqueToken } from "@/server/auth/tokens";
import { encryptTotpSecret, generateTotpSecret } from "@/server/auth/totp";

// Throwaway users in the running stack's database (DATABASE_URL, the compose db on localhost by default).
// The TOTP secret is encrypted with AUTH_SECRET, so it must match the stack's (the dev default does).

export const E2E_PASSWORD = "e2e-Geslo-2026!";

export type E2eUser = {
  surface: "dealer" | "backoffice";
  id: string;
  email: string;
  password: string;
  totpSecret: string | null;
};

type CommonOptions = { email?: string; name?: string; password?: string; totp?: boolean; status?: "active" | "invited" | "deactivated" };

export const uniqueEmail = (prefix: string) => `${prefix}-${randomUUID().slice(0, 8)}@e2e.drivebook.si`;

async function credentials(opts: CommonOptions, prefix: string) {
  const email = (opts.email ?? uniqueEmail(prefix)).toLowerCase();
  const password = opts.password ?? E2E_PASSWORD;
  const totpSecret = opts.totp ? generateTotpSecret() : null;
  return {
    email,
    password,
    totpSecret,
    values: {
      email,
      name: opts.name ?? "E2E uporabnik",
      status: opts.status ?? "active",
      passwordHash: await hashPassword(password),
      totpSecretEnc: totpSecret ? encryptTotpSecret(totpSecret) : null,
      totpEnabledAt: totpSecret ? new Date() : null,
    },
  };
}

export async function createDealerUser(
  opts: CommonOptions & { role?: "owner" | "salesperson"; dealerSlug?: string } = {},
): Promise<E2eUser> {
  const [dealer] = await getDb()
    .select({ id: dealers.id })
    .from(dealers)
    .where(eq(dealers.slug, opts.dealerSlug ?? DEMO_DEALER_SLUG))
    .limit(1);
  if (!dealer) throw new Error(`Dealer ${opts.dealerSlug ?? DEMO_DEALER_SLUG} not found; is the stack seeded?`);
  const { email, password, totpSecret, values } = await credentials(opts, "dealer");
  const [row] = await getDb()
    .insert(dealerUsers)
    .values({ ...values, dealerId: dealer.id, role: opts.role ?? "owner" })
    .returning({ id: dealerUsers.id });
  return { surface: "dealer", id: row!.id, email, password, totpSecret };
}

export async function createBackofficeUser(
  opts: CommonOptions & { role?: "superadmin" | "support" } = {},
): Promise<E2eUser> {
  const { email, password, totpSecret, values } = await credentials(opts, "backoffice");
  const [row] = await getDb()
    .insert(backofficeUsers)
    .values({ ...values, role: opts.role ?? "superadmin" })
    .returning({ id: backofficeUsers.id });
  return { surface: "backoffice", id: row!.id, email, password, totpSecret };
}

export function totpCode(user: Pick<E2eUser, "totpSecret">): string {
  if (!user.totpSecret) throw new Error("User has no TOTP secret");
  return generateSync({ secret: user.totpSecret });
}

export async function clearLoginAttempts({ emails = [], ips = [] }: { emails?: string[]; ips?: string[] }): Promise<void> {
  const where: SQL[] = [];
  if (emails.length) where.push(inArray(loginAttempts.email, emails.map((e) => e.toLowerCase())));
  if (ips.length) where.push(inArray(loginAttempts.ip, ips));
  if (where.length) await getDb().delete(loginAttempts).where(or(...where));
}

// Pretends the user's sessions were last refreshed long ago, so the next request slides them.
export async function backdateSessions(user: Pick<E2eUser, "surface" | "id">, lastSeenAt: Date): Promise<void> {
  const sessions = user.surface === "dealer" ? dealerSessions : backofficeSessions;
  await getDb().update(sessions).set({ lastSeenAt }).where(eq(sessions.userId, user.id));
}

export async function sessionExpiries(user: Pick<E2eUser, "surface" | "id">): Promise<Date[]> {
  const sessions = user.surface === "dealer" ? dealerSessions : backofficeSessions;
  const rows = await getDb().select({ expiresAt: sessions.expiresAt }).from(sessions).where(eq(sessions.userId, user.id));
  return rows.map((r) => r.expiresAt);
}

export type LinkTokenOptions = { state?: "valid" | "expired" | "used" };

// Inserts the row the links service would issue, so a link can be opened without reading the e-mail.
export async function issueLinkToken(
  user: Pick<E2eUser, "surface" | "id">,
  purpose: "invite" | "reset",
  { state = "valid" }: LinkTokenOptions = {},
): Promise<string> {
  const token = newOpaqueToken();
  const now = Date.now();
  await getDb()
    .insert(authTokens)
    .values({
      surface: user.surface,
      userId: user.id,
      purpose,
      tokenHash: hashToken(token),
      expiresAt: new Date(state === "expired" ? now - 60_000 : now + 60 * 60 * 1000),
      usedAt: state === "used" ? new Date(now) : null,
    });
  return token;
}

// Sessions cascade with the user; auth_tokens (no FK) and login_attempts are cleared too so reruns start clean.
export async function deleteUsers(users: E2eUser[]): Promise<void> {
  if (users.length) await getDb().delete(authTokens).where(inArray(authTokens.userId, users.map((u) => u.id)));
  const ids = (surface: E2eUser["surface"]) => users.filter((u) => u.surface === surface).map((u) => u.id);
  if (ids("dealer").length) await getDb().delete(dealerUsers).where(inArray(dealerUsers.id, ids("dealer")));
  if (ids("backoffice").length) {
    await getDb().delete(backofficeUsers).where(inArray(backofficeUsers.id, ids("backoffice")));
  }
  await clearLoginAttempts({ emails: users.map((u) => u.email) });
}

export async function closeDb(): Promise<void> {
  await getDb().$client.end();
}
