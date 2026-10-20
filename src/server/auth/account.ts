import { eq } from "drizzle-orm";
import { auditLog, backofficeUsers, dealerUsers } from "@/db/schema";
import { db } from "@/server/data/db";
import { hashPassword, validateNewPassword, verifyPassword } from "./password";
import { revokeUserSessions, type AuthSurface } from "./session";
import {
  decryptTotpSecret,
  encryptTotpSecret,
  generateTotpSecret,
  totpKeyUri,
  totpQrDataUrl,
  verifyTotpCode,
} from "./totp";

const usersTable = { dealer: dealerUsers, backoffice: backofficeUsers } as const;

export type AccountSummary = { email: string; role: string; totpEnabled: boolean };

const userFields = (u: typeof dealerUsers | typeof backofficeUsers) => ({
  id: u.id,
  email: u.email,
  role: u.role,
  passwordHash: u.passwordHash,
  totpSecretEnc: u.totpSecretEnc,
  totpEnabledAt: u.totpEnabledAt,
});

async function loadUser(surface: AuthSurface, userId: string) {
  const [user] =
    surface === "dealer"
      ? await db()
          .select({ ...userFields(dealerUsers), dealerId: dealerUsers.dealerId })
          .from(dealerUsers)
          .where(eq(dealerUsers.id, userId))
          .limit(1)
      : await db()
          .select({ ...userFields(backofficeUsers) })
          .from(backofficeUsers)
          .where(eq(backofficeUsers.id, userId))
          .limit(1)
          .then((rows) => rows.map((r) => ({ ...r, dealerId: null })));
  if (!user) throw new Error(`Unknown ${surface} user`);
  return user;
}

type LoadedUser = Awaited<ReturnType<typeof loadUser>>;

async function updateWithAudit(
  surface: AuthSurface,
  user: LoadedUser,
  values: Partial<typeof dealerUsers.$inferInsert>,
  action: string,
): Promise<void> {
  const users = usersTable[surface];
  await db().transaction(async (tx) => {
    await tx
      .update(users)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(users.id, user.id));
    await tx.insert(auditLog).values({
      dealerId: user.dealerId,
      actorKind: `${surface}_user`,
      actorId: user.id,
      action,
      entity: `${surface}_user`,
      entityId: user.id,
      data: { surface },
    });
  });
}

async function passwordMatches(user: LoadedUser, plain: string): Promise<boolean> {
  return user.passwordHash ? verifyPassword(user.passwordHash, plain) : false;
}

export async function getAccountSummary(surface: AuthSurface, userId: string): Promise<AccountSummary> {
  const user = await loadUser(surface, userId);
  return { email: user.email, role: user.role, totpEnabled: user.totpEnabledAt !== null };
}

export async function changePassword(
  surface: AuthSurface,
  userId: string,
  input: { currentPassword: string; newPassword: string; currentSessionId: string },
): Promise<{ ok: true } | { ok: false; error: "wrong_password" | "too_short" }> {
  const user = await loadUser(surface, userId);
  if (!(await passwordMatches(user, input.currentPassword))) return { ok: false, error: "wrong_password" };
  const invalid = validateNewPassword(input.newPassword);
  if (invalid) return { ok: false, error: invalid };

  await updateWithAudit(surface, user, { passwordHash: await hashPassword(input.newPassword) }, "auth.password.changed");
  await revokeUserSessions(surface, userId, { exceptSessionId: input.currentSessionId });
  return { ok: true };
}

export async function startTotpSetup(
  surface: AuthSurface,
  userId: string,
): Promise<{ secret: string; qrDataUrl: string; keyUri: string }> {
  const user = await loadUser(surface, userId);
  // Overwriting the secret of an enabled 2FA would silently change the login factor.
  if (user.totpEnabledAt) throw new Error("TOTP is already enabled");

  const secret = generateTotpSecret();
  const keyUri = totpKeyUri(secret, user.email);
  const qrDataUrl = await totpQrDataUrl(keyUri);
  const users = usersTable[surface];
  await db()
    .update(users)
    .set({ totpSecretEnc: encryptTotpSecret(secret), totpEnabledAt: null, updatedAt: new Date() })
    .where(eq(users.id, userId));
  return { secret, qrDataUrl, keyUri };
}

export async function confirmTotpSetup(
  surface: AuthSurface,
  userId: string,
  code: string,
): Promise<{ ok: true } | { ok: false; error: "invalid_code" | "no_pending_setup" }> {
  const user = await loadUser(surface, userId);
  if (user.totpEnabledAt || !user.totpSecretEnc) return { ok: false, error: "no_pending_setup" };
  if (!verifyTotpCode(decryptTotpSecret(user.totpSecretEnc), code)) return { ok: false, error: "invalid_code" };

  await updateWithAudit(surface, user, { totpEnabledAt: new Date() }, "auth.totp.enabled");
  return { ok: true };
}

export async function disableTotp(
  surface: AuthSurface,
  userId: string,
  input: { password: string; code: string },
): Promise<{ ok: true } | { ok: false; error: "wrong_password" | "invalid_code" | "not_enabled" }> {
  const user = await loadUser(surface, userId);
  if (!user.totpEnabledAt || !user.totpSecretEnc) return { ok: false, error: "not_enabled" };
  if (!(await passwordMatches(user, input.password))) return { ok: false, error: "wrong_password" };
  if (!verifyTotpCode(decryptTotpSecret(user.totpSecretEnc), input.code)) return { ok: false, error: "invalid_code" };

  await updateWithAudit(surface, user, { totpSecretEnc: null, totpEnabledAt: null }, "auth.totp.disabled");
  return { ok: true };
}
