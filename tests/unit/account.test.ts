// Real-database tests: start Postgres with `docker compose up -d db` (uses TEST_DATABASE_URL).
import { and, eq } from "drizzle-orm";
import { generateSync } from "otplib";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { auditLog, backofficeSessions, backofficeUsers, dealers, dealerSessions, dealerUsers, plans } from "@/db/schema";
import { decryptTotpSecret } from "@/server/auth/totp";
import { hashPassword, verifyPassword } from "@/server/auth/password";
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

function wrongCode(secret: string): string {
  const valid = generateSync({ secret });
  return String((Number(valid) + 500_000) % 1_000_000).padStart(6, "0");
}

async function seedUsers() {
  const [plan] = await db
    .insert(plans)
    .values({ code: "basic", name: "Basic", maxCars: 20, maxUsers: 5, smsIncluded: 100, priceEurCents: 4900 })
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
    });
    expect(result).toEqual({ ok: false, error: "wrong_password" });
    expect(await auditRows("auth.password.changed")).toHaveLength(0);
  });

  it("rejects a short new password", async () => {
    const result = await changePassword("dealer", seeded.dealerUser.id, {
      currentPassword: PASSWORD,
      newPassword: "short",
      currentSessionId: "00000000-0000-0000-0000-000000000000",
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
    expect(await disableTotp("backoffice", seeded.backofficeUser.id, { password: PASSWORD, code: "123456" })).toEqual({
      ok: false,
      error: "not_enabled",
    });
  });

  it("rejects a wrong password or code and turns off with both correct", async () => {
    const userId = seeded.backofficeUser.id;
    const secret = await enable(userId);

    expect(
      await disableTotp("backoffice", userId, { password: "not the password", code: generateSync({ secret }) }),
    ).toEqual({ ok: false, error: "wrong_password" });
    expect((await getAccountSummary("backoffice", userId)).totpEnabled).toBe(true);

    expect(await disableTotp("backoffice", userId, { password: PASSWORD, code: wrongCode(secret) })).toEqual({
      ok: false,
      error: "invalid_code",
    });
    expect((await getAccountSummary("backoffice", userId)).totpEnabled).toBe(true);
    expect(await auditRows("auth.totp.disabled")).toHaveLength(0);

    expect(await disableTotp("backoffice", userId, { password: PASSWORD, code: generateSync({ secret }) })).toEqual({
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
