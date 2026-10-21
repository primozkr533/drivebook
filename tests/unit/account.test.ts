// Real-database tests: start Postgres with `docker compose up -d db` (uses TEST_DATABASE_URL).
import { and, eq } from "drizzle-orm";
import { generateSync } from "otplib";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  auditLog,
  backofficeSessions,
  backofficeUsers,
  dealers,
  dealerSessions,
  dealerUsers,
  loginAttempts,
  plans,
} from "@/db/schema";
import { decryptTotpSecret } from "@/server/auth/totp";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { isLoginRateLimited, LOGIN_MAX_ACCOUNT_FAILURES, recordLoginAttempt } from "@/server/auth/rate-limit";
import { setDbForTests } from "@/server/data/db";
import { getTestDb, truncateAll } from "../setup/db";

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => {} }) }));

const { createSession, validateSessionToken } = await import("@/server/auth/session");
const { changePassword, confirmTotpSetup, disableTotp, getAccountSummary, startTotpSetup } = await import(
  "@/server/auth/account"
);

const db = getTestDb();
const PASSWORD = "correct horse battery";
const meta = { ip: "127.0.0.1", userAgent: "vitest" };

// The step after the one consumed by confirmTotpSetup, still inside the verification tolerance.
const nextCode = (secret: string) => generateSync({ secret, epoch: Math.floor(Date.now() / 1000) + 30 });

function wrongCode(secret: string): string {
  const valid = generateSync({ secret });
  return String((Number(valid) + 500_000) % 1_000_000).padStart(6, "0");
}

async function seedUsers() {
  const [plan] = await db
    .insert(plans)
    .values({ code: "basic", name: "Basic", maxCars: 20, maxUsers: 5, monthlySmsQuota: 100, priceEurCents: 4900 })
    .returning();
  const [dealer] = await db
    .insert(dealers)
    .values({
      slug: "demo",
      name: "Demo",
      legalName: "Demo d.o.o.",
      addressLine: "Dunajska cesta 1",
      postalCode: "1000",
      city: "Ljubljana",
      phone: "+38611234567",
      email: "info@demo.si",
      primaryColor: "#E4572E",
      planId: plan.id,
    })
    .returning();
  const passwordHash = await hashPassword(PASSWORD);
  const [dealerUser] = await db
    .insert(dealerUsers)
    .values({ dealerId: dealer.id, email: "owner@demo.si", name: "Owner", role: "owner", status: "active", passwordHash })
    .returning();
  const [backofficeUser] = await db
    .insert(backofficeUsers)
    .values({ email: "admin@drivebook.si", name: "Admin", role: "superadmin", status: "active", passwordHash })
    .returning();
  return { dealer, dealerUser, backofficeUser };
}

let seeded: Awaited<ReturnType<typeof seedUsers>>;

beforeAll(() => setDbForTests(db));
afterAll(() => setDbForTests(undefined));
beforeEach(async () => {
  await truncateAll();
  seeded = await seedUsers();
});

async function auditRows(action: string) {
  return db.select().from(auditLog).where(eq(auditLog.action, action));
}

describe("getAccountSummary", () => {
  it("returns email, role and 2FA state", async () => {
    expect(await getAccountSummary("dealer", seeded.dealerUser.id)).toEqual({
      email: "owner@demo.si",
      role: "owner",
      totpEnabled: false,
    });
    expect(await getAccountSummary("backoffice", seeded.backofficeUser.id)).toEqual({
      email: "admin@drivebook.si",
      role: "superadmin",
      totpEnabled: false,
    });
  });
});

describe("changePassword", () => {
  it("rejects a wrong current password", async () => {
    const result = await changePassword("dealer", seeded.dealerUser.id, {
      currentPassword: "not the password",
      newPassword: "a brand new password",
      currentSessionId: "00000000-0000-0000-0000-000000000000",
      ip: meta.ip,
    });
    expect(result).toEqual({ ok: false, error: "wrong_password" });
    expect(await auditRows("auth.password.changed")).toHaveLength(0);
  });

  it("rejects a short new password", async () => {
    const result = await changePassword("dealer", seeded.dealerUser.id, {
      currentPassword: PASSWORD,
      newPassword: "short",
      currentSessionId: "00000000-0000-0000-0000-000000000000",
      ip: meta.ip,
    });
    expect(result).toEqual({ ok: false, error: "too_short" });
  });

  it("updates the hash, keeps the current session and revokes the others", async () => {
    const userId = seeded.dealerUser.id;
    const current = await createSession("dealer", userId, meta);
    const other = await createSession("dealer", userId, meta);
    const currentSession = (await validateSessionToken("dealer", current))!.session;

    const result = await changePassword("dealer", userId, {
      currentPassword: PASSWORD,
      newPassword: "a brand new password",
      currentSessionId: currentSession.id,
      ip: meta.ip,
    });
    expect(result).toEqual({ ok: true });

    const [user] = await db.select().from(dealerUsers).where(eq(dealerUsers.id, userId));
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword(user.passwordHash!, "a brand new password")).toBe(true);
    expect(await verifyPassword(user.passwordHash!, PASSWORD)).toBe(false);

    expect(await validateSessionToken("dealer", current)).not.toBeNull();
    expect(await validateSessionToken("dealer", other)).toBeNull();
    expect(await db.select().from(dealerSessions).where(eq(dealerSessions.userId, userId))).toHaveLength(1);

    const [audit] = await auditRows("auth.password.changed");
    expect(audit).toMatchObject({ dealerId: seeded.dealer.id, actorId: userId, entityId: userId });
  });

  it("works on the backoffice surface", async () => {
    const userId = seeded.backofficeUser.id;
    const current = await createSession("backoffice", userId, meta);
    await createSession("backoffice", userId, meta);
    const currentSession = (await validateSessionToken("backoffice", current))!.session;

    const result = await changePassword("backoffice", userId, {
      currentPassword: PASSWORD,
      newPassword: "a brand new password",
      currentSessionId: currentSession.id,
      ip: meta.ip,
    });
    expect(result).toEqual({ ok: true });
    expect(await db.select().from(backofficeSessions).where(eq(backofficeSessions.userId, userId))).toHaveLength(1);
    const [audit] = await auditRows("auth.password.changed");
    expect(audit).toMatchObject({ dealerId: null, actorId: userId });
  });
});

describe("enabling 2FA", () => {
  it("stores a pending secret, rejects a wrong code and enables with a valid one", async () => {
    const userId = seeded.dealerUser.id;
    const setup = await startTotpSetup("dealer", userId);
    expect(setup.qrDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(setup.keyUri).toContain(`secret=${setup.secret}`);

    const [pending] = await db.select().from(dealerUsers).where(eq(dealerUsers.id, userId));
    expect(pending.totpEnabledAt).toBeNull();
    expect(pending.totpSecretEnc).not.toContain(setup.secret);
    expect(decryptTotpSecret(pending.totpSecretEnc!)).toBe(setup.secret);
    expect((await getAccountSummary("dealer", userId)).totpEnabled).toBe(false);

    expect(await confirmTotpSetup("dealer", userId, wrongCode(setup.secret))).toEqual({
      ok: false,
      error: "invalid_code",
    });
    expect((await getAccountSummary("dealer", userId)).totpEnabled).toBe(false);
    expect(await auditRows("auth.totp.enabled")).toHaveLength(0);

    expect(await confirmTotpSetup("dealer", userId, generateSync({ secret: setup.secret }))).toEqual({ ok: true });
    expect((await getAccountSummary("dealer", userId)).totpEnabled).toBe(true);
    const [audit] = await auditRows("auth.totp.enabled");
    expect(audit).toMatchObject({ dealerId: seeded.dealer.id, actorId: userId });
  });

  it("reports no pending setup when none was started", async () => {
    expect(await confirmTotpSetup("backoffice", seeded.backofficeUser.id, "123456")).toEqual({
      ok: false,
      error: "no_pending_setup",
    });
  });

  it("refuses to restart setup while 2FA is enabled", async () => {
    const userId = seeded.backofficeUser.id;
    const setup = await startTotpSetup("backoffice", userId);
    await confirmTotpSetup("backoffice", userId, generateSync({ secret: setup.secret }));
    await expect(startTotpSetup("backoffice", userId)).rejects.toThrow();
  });
});

describe("disabling 2FA", () => {
  async function enable(userId: string) {
    const setup = await startTotpSetup("backoffice", userId);
    await confirmTotpSetup("backoffice", userId, generateSync({ secret: setup.secret }));
    return setup.secret;
  }

  it("reports not_enabled when 2FA is off", async () => {
    expect(await disableTotp("backoffice", seeded.backofficeUser.id, { password: PASSWORD, code: "123456", ip: meta.ip })).toEqual({
      ok: false,
      error: "not_enabled",
    });
  });

  it("rejects a wrong password or code and turns off with both correct", async () => {
    const userId = seeded.backofficeUser.id;
    const secret = await enable(userId);

    expect(
      await disableTotp("backoffice", userId, { password: "not the password", code: generateSync({ secret }), ip: meta.ip }),
    ).toEqual({ ok: false, error: "wrong_password" });
    expect((await getAccountSummary("backoffice", userId)).totpEnabled).toBe(true);

    expect(await disableTotp("backoffice", userId, { password: PASSWORD, code: wrongCode(secret), ip: meta.ip })).toEqual({
      ok: false,
      error: "invalid_code",
    });
    expect((await getAccountSummary("backoffice", userId)).totpEnabled).toBe(true);
    expect(await auditRows("auth.totp.disabled")).toHaveLength(0);

    expect(await disableTotp("backoffice", userId, { password: PASSWORD, code: nextCode(secret), ip: meta.ip })).toEqual({
      ok: true,
    });
    const [user] = await db.select().from(backofficeUsers).where(eq(backofficeUsers.id, userId));
    expect(user.totpEnabledAt).toBeNull();
    expect(user.totpSecretEnc).toBeNull();
    const audits = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.action, "auth.totp.disabled"), eq(auditLog.actorId, userId)));
    expect(audits).toHaveLength(1);
  });
});

describe("single-use codes", () => {
  const stepOf = (epoch: number) => Math.floor(epoch / 30);

  it("confirmTotpSetup stores the step and rejects a code at or before it", async () => {
    const userId = seeded.dealerUser.id;
    const setup = await startTotpSetup("dealer", userId);
    const epoch = Math.floor(Date.now() / 1000);
    await db.update(dealerUsers).set({ totpLastStep: stepOf(epoch) }).where(eq(dealerUsers.id, userId));
    expect(await confirmTotpSetup("dealer", userId, generateSync({ secret: setup.secret, epoch }))).toEqual({
      ok: false,
      error: "invalid_code",
    });
    expect((await getAccountSummary("dealer", userId)).totpEnabled).toBe(false);

    expect(await confirmTotpSetup("dealer", userId, generateSync({ secret: setup.secret, epoch: epoch + 30 }))).toEqual({
      ok: true,
    });
    const [user] = await db.select().from(dealerUsers).where(eq(dealerUsers.id, userId));
    expect(user.totpLastStep).toBe(stepOf(epoch) + 1);
  });

  it("disableTotp rejects the code used to enable 2FA as invalid and counts the failure", async () => {
    const userId = seeded.backofficeUser.id;
    const setup = await startTotpSetup("backoffice", userId);
    const code = generateSync({ secret: setup.secret });
    expect(await confirmTotpSetup("backoffice", userId, code)).toEqual({ ok: true });
    const [enabled] = await db.select().from(backofficeUsers).where(eq(backofficeUsers.id, userId));
    expect(enabled.totpLastStep).toEqual(expect.any(Number));

    expect(await disableTotp("backoffice", userId, { password: PASSWORD, code, ip: meta.ip })).toEqual({
      ok: false,
      error: "invalid_code",
    });
    expect((await getAccountSummary("backoffice", userId)).totpEnabled).toBe(true);
    expect(await db.select().from(loginAttempts)).toHaveLength(1);
    expect(await auditRows("auth.totp.disable_failed")).toMatchObject([{ data: { reason: "invalid_code" } }]);

    expect(await disableTotp("backoffice", userId, { password: PASSWORD, code: nextCode(setup.secret), ip: meta.ip })).toEqual({
      ok: true,
    });
    const [disabled] = await db.select().from(backofficeUsers).where(eq(backofficeUsers.id, userId));
    expect(disabled.totpLastStep).toBeGreaterThan(enabled.totpLastStep!);
  });
});

describe("users of a read_only dealer", () => {
  beforeEach(async () => {
    await db.update(dealers).set({ status: "read_only" }).where(eq(dealers.id, seeded.dealer.id));
  });

  it("can change their password, with an audit row", async () => {
    const userId = seeded.dealerUser.id;
    const token = await createSession("dealer", userId, meta);
    const session = (await validateSessionToken("dealer", token))!.session;

    expect(
      await changePassword("dealer", userId, {
        currentPassword: PASSWORD,
        newPassword: "a brand new password",
        currentSessionId: session.id,
        ip: meta.ip,
      }),
    ).toEqual({ ok: true });
    const [user] = await db.select().from(dealerUsers).where(eq(dealerUsers.id, userId));
    expect(await verifyPassword(user.passwordHash!, "a brand new password")).toBe(true);
    expect(await auditRows("auth.password.changed")).toMatchObject([{ dealerId: seeded.dealer.id, actorId: userId }]);
  });

  it("can start, enable and disable 2FA, each with an audit row", async () => {
    const userId = seeded.dealerUser.id;
    const setup = await startTotpSetup("dealer", userId);
    expect(await auditRows("auth.totp.setup_started")).toMatchObject([
      { dealerId: seeded.dealer.id, actorId: userId, entityId: userId },
    ]);

    expect(await confirmTotpSetup("dealer", userId, generateSync({ secret: setup.secret }))).toEqual({ ok: true });
    expect((await getAccountSummary("dealer", userId)).totpEnabled).toBe(true);
    expect(await auditRows("auth.totp.enabled")).toMatchObject([{ dealerId: seeded.dealer.id, actorId: userId }]);

    expect(
      await disableTotp("dealer", userId, { password: PASSWORD, code: nextCode(setup.secret), ip: meta.ip }),
    ).toEqual({ ok: true });
    expect((await getAccountSummary("dealer", userId)).totpEnabled).toBe(false);
    expect(await auditRows("auth.totp.disabled")).toMatchObject([{ dealerId: seeded.dealer.id, actorId: userId }]);
  });
});

describe("failed credential checks", () => {
  const SESSION_ID = "00000000-0000-0000-0000-000000000000";
  const changeWith = (userId: string, currentPassword: string) =>
    changePassword("dealer", userId, {
      currentPassword,
      newPassword: "a brand new password",
      currentSessionId: SESSION_ID,
      ip: meta.ip,
    });

  async function enableBackoffice() {
    const userId = seeded.backofficeUser.id;
    const setup = await startTotpSetup("backoffice", userId);
    await confirmTotpSetup("backoffice", userId, generateSync({ secret: setup.secret }));
    return { userId, secret: setup.secret };
  }

  it("locks changePassword after repeated wrong passwords, even for the correct one", async () => {
    const userId = seeded.dealerUser.id;
    for (let i = 0; i < LOGIN_MAX_ACCOUNT_FAILURES; i++) {
      expect(await changeWith(userId, "not the password")).toEqual({ ok: false, error: "wrong_password" });
    }
    expect(await changeWith(userId, PASSWORD)).toEqual({ ok: false, error: "rate_limited" });

    const [user] = await db.select().from(dealerUsers).where(eq(dealerUsers.id, userId));
    expect(await verifyPassword(user.passwordHash!, PASSWORD)).toBe(true);
    expect(await auditRows("auth.password.changed")).toHaveLength(0);

    const audits = await auditRows("auth.password.check_failed");
    expect(audits).toHaveLength(LOGIN_MAX_ACCOUNT_FAILURES);
    expect(audits[0]).toMatchObject({
      dealerId: seeded.dealer.id,
      actorKind: "dealer_user",
      actorId: userId,
      entityId: userId,
      data: { surface: "dealer", reason: "wrong_password", ip: meta.ip },
    });
    // The blocked attempt is not recorded, so it does not extend the lockout.
    expect(await db.select().from(loginAttempts)).toHaveLength(LOGIN_MAX_ACCOUNT_FAILURES);
  });

  it("shares the per-account counter with login in both directions", async () => {
    const userId = seeded.dealerUser.id;
    for (let i = 0; i < LOGIN_MAX_ACCOUNT_FAILURES; i++) {
      await recordLoginAttempt("dealer", "Owner@Demo.si", "10.0.0." + i, false);
    }
    expect(await changeWith(userId, PASSWORD)).toEqual({ ok: false, error: "rate_limited" });

    await truncateAll();
    seeded = await seedUsers();
    for (let i = 0; i < LOGIN_MAX_ACCOUNT_FAILURES; i++) await changeWith(seeded.dealerUser.id, "not the password");
    expect(await isLoginRateLimited("dealer", "owner@demo.si", "10.9.9.9")).toBe(true);
    expect(await isLoginRateLimited("backoffice", "owner@demo.si", "10.9.9.9")).toBe(false);
  });

  it("locks disableTotp after wrong passwords and codes, auditing each failure", async () => {
    const { userId, secret } = await enableBackoffice();
    const disable = (password: string, code: string) => disableTotp("backoffice", userId, { password, code, ip: meta.ip });

    expect(await disable("not the password", generateSync({ secret }))).toEqual({ ok: false, error: "wrong_password" });
    for (let i = 1; i < LOGIN_MAX_ACCOUNT_FAILURES; i++) {
      expect(await disable(PASSWORD, wrongCode(secret))).toEqual({ ok: false, error: "invalid_code" });
    }
    expect(await disable(PASSWORD, nextCode(secret))).toEqual({ ok: false, error: "rate_limited" });
    expect((await getAccountSummary("backoffice", userId)).totpEnabled).toBe(true);

    const audits = await auditRows("auth.totp.disable_failed");
    expect(audits).toHaveLength(LOGIN_MAX_ACCOUNT_FAILURES);
    expect(audits.map((a) => (a.data as { reason: string }).reason).sort()).toEqual([
      "invalid_code",
      "invalid_code",
      "invalid_code",
      "invalid_code",
      "wrong_password",
    ]);
    expect(audits[0]).toMatchObject({ dealerId: null, actorKind: "backoffice_user", actorId: userId, entityId: userId });
    expect(await isLoginRateLimited("backoffice", "admin@drivebook.si", "10.9.9.9")).toBe(true);
  });

  it("lets a correct first attempt succeed without recording a failure", async () => {
    expect(await changeWith(seeded.dealerUser.id, PASSWORD)).toEqual({ ok: true });
    const { userId, secret } = await enableBackoffice();
    expect(await disableTotp("backoffice", userId, { password: PASSWORD, code: nextCode(secret), ip: meta.ip })).toEqual({
      ok: true,
    });
    expect(await db.select().from(loginAttempts)).toHaveLength(0);
    expect(await auditRows("auth.password.check_failed")).toHaveLength(0);
    expect(await auditRows("auth.totp.disable_failed")).toHaveLength(0);
  });

  it("audits failures for users of a suspended dealer", async () => {
    await db.update(dealers).set({ status: "suspended" }).where(eq(dealers.id, seeded.dealer.id));
    expect(await changeWith(seeded.dealerUser.id, "not the password")).toEqual({ ok: false, error: "wrong_password" });
    expect(await auditRows("auth.password.check_failed")).toMatchObject([
      { dealerId: seeded.dealer.id, actorId: seeded.dealerUser.id },
    ]);
  });
});
