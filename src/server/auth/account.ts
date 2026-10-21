import { eq } from "drizzle-orm";
import { auditLog, backofficeUsers, dealerUsers } from "@/db/schema";
import { db } from "@/server/data/db";
import { hashPassword, validateNewPassword, verifyPassword } from "./password";
import { isLoginRateLimited, recordLoginAttempt } from "./rate-limit";
import { revokeUserSessions, type AuthSurface } from "./session";
import {
  acceptTotpCode,
  decryptTotpSecret,
  encryptTotpSecret,
  generateTotpSecret,
  totpKeyUri,
  totpQrDataUrl,
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
type Executor = Pick<ReturnType<typeof db>, "insert">;

async function insertAudit(
  executor: Executor,
  surface: AuthSurface,
  user: LoadedUser,
  action: string,
  data: Record<string, unknown> = {},
): Promise<void> {
  await executor.insert(auditLog).values({
    dealerId: user.dealerId,
    actorKind: `${surface}_user`,
    actorId: user.id,
    action,
    entity: `${surface}_user`,
    entityId: user.id,
    data: { ...data, surface },
  });
}

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
    await insertAudit(tx, surface, user, action);
  });
}

// Account-page failures share the login lockout, so a signed-in browser can't guess the password without limit.
async function recordCheckFailure(
  surface: AuthSurface,
  user: LoadedUser,
  ip: string,
  action: string,
  reason: "wrong_password" | "invalid_code",
): Promise<void> {
  await recordLoginAttempt(surface, user.email, ip, false);
  await insertAudit(db(), surface, user, action, { reason, ip });
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
  input: { currentPassword: string; newPassword: string; currentSessionId: string; ip: string },
): Promise<{ ok: true } | { ok: false; error: "wrong_password" | "too_short" | "rate_limited" }> {
  const user = await loadUser(surface, userId);
  if (await isLoginRateLimited(surface, user.email, input.ip)) return { ok: false, error: "rate_limited" };
  if (!(await passwordMatches(user, input.currentPassword))) {
    await recordCheckFailure(surface, user, input.ip, "auth.password.check_failed", "wrong_password");
    return { ok: false, error: "wrong_password" };
  }
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
  await updateWithAudit(
    surface,
    user,
    { totpSecretEnc: encryptTotpSecret(secret), totpEnabledAt: null },
    "auth.totp.setup_started",
  );
  return { secret, qrDataUrl, keyUri };
}

export async function confirmTotpSetup(
  surface: AuthSurface,
  userId: string,
  code: string,
): Promise<{ ok: true } | { ok: false; error: "invalid_code" | "no_pending_setup" }> {
  const user = await loadUser(surface, userId);
  if (user.totpEnabledAt || !user.totpSecretEnc) return { ok: false, error: "no_pending_setup" };
  if (!(await acceptTotpCode(surface, user.id, decryptTotpSecret(user.totpSecretEnc), code))) {
    return { ok: false, error: "invalid_code" };
  }

  await updateWithAudit(surface, user, { totpEnabledAt: new Date() }, "auth.totp.enabled");
  return { ok: true };
}

export async function disableTotp(
  surface: AuthSurface,
  userId: string,
  input: { password: string; code: string; ip: string },
): Promise<{ ok: true } | { ok: false; error: "wrong_password" | "invalid_code" | "not_enabled" | "rate_limited" }> {
  const user = await loadUser(surface, userId);
  if (!user.totpEnabledAt || !user.totpSecretEnc) return { ok: false, error: "not_enabled" };
  if (await isLoginRateLimited(surface, user.email, input.ip)) return { ok: false, error: "rate_limited" };
  if (!(await passwordMatches(user, input.password))) {
    await recordCheckFailure(surface, user, input.ip, "auth.totp.disable_failed", "wrong_password");
    return { ok: false, error: "wrong_password" };
  }
  if (!(await acceptTotpCode(surface, user.id, decryptTotpSecret(user.totpSecretEnc), input.code))) {
    await recordCheckFailure(surface, user, input.ip, "auth.totp.disable_failed", "invalid_code");
    return { ok: false, error: "invalid_code" };
  }

  await updateWithAudit(surface, user, { totpSecretEnc: null, totpEnabledAt: null }, "auth.totp.disabled");
  return { ok: true };
}
