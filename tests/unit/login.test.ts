// Real-database tests: start Postgres with `docker compose up -d db` (uses TEST_DATABASE_URL).
import { desc, eq } from "drizzle-orm";
import { generateSync } from "otplib";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { auditLog, backofficeUsers, dealers, dealerUsers, loginAttempts, plans } from "@/db/schema";
import { hashPassword } from "@/server/auth/password";
import { encryptTotpSecret, generateTotpSecret } from "@/server/auth/totp";
import { setDbForTests } from "@/server/data/db";
import { getTestDb, truncateAll } from "../setup/db";

const jar = new Map<string, { value: string }>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)!.value } : undefined),
    set: (name: string, value: string) => void jar.set(name, { value }),
  }),
}));

const { PENDING_TOKEN_TTL_MS, login, logout, signPendingToken } = await import("@/server/auth/login");
const { LOGIN_MAX_ACCOUNT_FAILURES, LOGIN_MAX_IP_FAILURES, LOGIN_RATE_WINDOW_MS } = await import(
  "@/server/auth/rate-limit"
);
const { SESSION_COOKIE, validateSessionToken } = await import("@/server/auth/session");

const db = getTestDb();
const PASSWORD = "correct horse battery";
const base = { ip: "10.0.0.1", userAgent: "vitest" };

async function seed() {
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
      status: "read_only",
    })
    .returning();
  const passwordHash = await hashPassword(PASSWORD);
  const totpSecret = generateTotpSecret();
  const [owner, , deactivated, twoFactor] = await db
    .insert(dealerUsers)
    .values([
      { dealerId: dealer.id, email: "owner@demo.si", name: "Owner", role: "owner", status: "active", passwordHash },
      { dealerId: dealer.id, email: "invited@demo.si", name: "Invited", role: "salesperson", status: "invited" },
      { dealerId: dealer.id, email: "gone@demo.si", name: "Gone", role: "salesperson", status: "deactivated", passwordHash },
      {
        dealerId: dealer.id,
        email: "2fa@demo.si",
        name: "Two",
        role: "owner",
        status: "active",
        passwordHash,
        totpSecretEnc: encryptTotpSecret(totpSecret),
        totpEnabledAt: new Date(),
      },
    ])
    .returning();
  const [admin] = await db
    .insert(backofficeUsers)
    .values({ email: "admin@drivebook.si", name: "Admin", role: "superadmin", status: "active", passwordHash })
    .returning();
  return { dealer, owner, deactivated, twoFactor, totpSecret, admin };
}

let s: Awaited<ReturnType<typeof seed>>;

beforeAll(() => setDbForTests(db));
afterAll(() => setDbForTests(undefined));
beforeEach(async () => {
  jar.clear();
  await truncateAll();
  s = await seed();
});

describe("password login", () => {
  it("creates a valid session for correct credentials (even for a read-only dealer)", async () => {
    const result = await login({ ...base, surface: "dealer", email: "  Owner@Demo.SI ", password: PASSWORD });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const session = await validateSessionToken("dealer", result.token);
    expect(session?.user.id).toBe(s.owner.id);
    expect(session?.session.ip).toBe(base.ip);
  });

  it("logs backoffice users into the backoffice surface", async () => {
    const result = await login({ ...base, surface: "backoffice", email: "admin@drivebook.si", password: PASSWORD });
    expect(result.ok).toBe(true);
    if (result.ok) expect((await validateSessionToken("backoffice", result.token))?.user.id).toBe(s.admin.id);
  });

  it.each([
    ["wrong password", "owner@demo.si", "nope nope nope"],
    ["unknown email", "nobody@demo.si", PASSWORD],
    ["invited user without a password", "invited@demo.si", PASSWORD],
    ["deactivated user", "gone@demo.si", PASSWORD],
  ])("returns exactly { ok:false, error:'invalid' } for a %s", async (_label, email, password) => {
    expect(await login({ ...base, surface: "dealer", email, password })).toEqual({ ok: false, error: "invalid" });
  });

  it("keeps the surfaces' user tables separate", async () => {
    expect(await login({ ...base, surface: "backoffice", email: "owner@demo.si", password: PASSWORD })).toEqual({
      ok: false,
      error: "invalid",
    });
    expect(await login({ ...base, surface: "dealer", email: "admin@drivebook.si", password: PASSWORD })).toEqual({
      ok: false,
      error: "invalid",
    });
  });
});

describe("rate limiting", () => {
  it("blocks the 6th attempt for one account within the window, even with the correct password", async () => {
    for (let i = 0; i < LOGIN_MAX_ACCOUNT_FAILURES; i++) {
      const r = await login({ ...base, ip: `10.1.0.${i}`, surface: "dealer", email: "owner@demo.si", password: "x" });
      expect(r).toEqual({ ok: false, error: "invalid" });
    }
    expect(await login({ ...base, surface: "dealer", email: "OWNER@demo.si", password: PASSWORD })).toEqual({
      ok: false,
      error: "rate_limited",
    });
    // Per surface: the backoffice account with another email is unaffected.
    expect((await login({ ...base, surface: "backoffice", email: "admin@drivebook.si", password: PASSWORD })).ok).toBe(
      true,
    );
  });

  it("blocks an IP after 20 failures across different emails", async () => {
    for (let i = 0; i < LOGIN_MAX_IP_FAILURES; i++) {
      await login({ ...base, surface: "dealer", email: `user${i}@demo.si`, password: "x" });
    }
    expect(await login({ ...base, surface: "dealer", email: "owner@demo.si", password: PASSWORD })).toEqual({
      ok: false,
      error: "rate_limited",
    });
    expect((await login({ ...base, ip: "10.9.9.9", surface: "dealer", email: "owner@demo.si", password: PASSWORD })).ok).toBe(
      true,
    );
  });

  it("counts only failures inside the window, and successes don't reset history", async () => {
    const old = new Date(Date.now() - LOGIN_RATE_WINDOW_MS - 1000);
    await db.insert(loginAttempts).values(
      Array.from({ length: 10 }, () => ({ surface: "dealer" as const, email: "owner@demo.si", ip: base.ip, success: false, createdAt: old })),
    );
    expect((await login({ ...base, surface: "dealer", email: "owner@demo.si", password: PASSWORD })).ok).toBe(true);

    for (let i = 0; i < LOGIN_MAX_ACCOUNT_FAILURES - 1; i++) {
      await login({ ...base, surface: "dealer", email: "owner@demo.si", password: "x" });
    }
    expect((await login({ ...base, surface: "dealer", email: "owner@demo.si", password: PASSWORD })).ok).toBe(true);
    await login({ ...base, surface: "dealer", email: "owner@demo.si", password: "x" });
    expect((await login({ ...base, surface: "dealer", email: "owner@demo.si", password: PASSWORD })).ok).toBe(false);

    const rows = await db.select().from(loginAttempts).where(eq(loginAttempts.createdAt, old));
    expect(rows).toHaveLength(10);
    const all = await db.select({ success: loginAttempts.success }).from(loginAttempts);
    expect(all.filter((r) => r.success)).toHaveLength(2);
  });
});

describe("TOTP step", () => {
  async function start() {
    const r = await login({ ...base, surface: "dealer", email: "2fa@demo.si", password: PASSWORD });
    expect(r).toMatchObject({ ok: false, error: "totp_required", pendingToken: expect.any(String) });
    return (r as { pendingToken: string }).pendingToken;
  }

  it("requires a code, then accepts a valid one with the pending token", async () => {
    const pendingToken = await start();
    const r = await login({ ...base, surface: "dealer", email: "", pendingToken, totpCode: generateSync({ secret: s.totpSecret }) });
    expect(r.ok).toBe(true);
    if (r.ok) expect((await validateSessionToken("dealer", r.token))?.user.id).toBe(s.twoFactor.id);
  });

  it("rejects a wrong code with totp_invalid and counts it as an account failure", async () => {
    const pendingToken = await start();
    const valid = generateSync({ secret: s.totpSecret });
    const wrong = valid === "000000" ? "111111" : "000000";
    for (let i = 0; i < LOGIN_MAX_ACCOUNT_FAILURES; i++) {
      expect(await login({ ...base, surface: "dealer", email: "", pendingToken, totpCode: wrong })).toEqual({
        ok: false,
        error: "totp_invalid",
        pendingToken,
      });
    }
    expect(await login({ ...base, surface: "dealer", email: "", pendingToken, totpCode: valid })).toEqual({
      ok: false,
      error: "rate_limited",
    });
  });

  it("rejects expired, tampered and cross-surface pending tokens as invalid", async () => {
    const totpCode = generateSync({ secret: s.totpSecret });
    const expired = signPendingToken("dealer", s.twoFactor.id, Date.now() - PENDING_TOKEN_TTL_MS - 1000);
    const valid = await start();
    const [payload, sig] = valid.split(".");
    const forged = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(payload, "base64url").toString()), u: s.owner.id }),
    ).toString("base64url");
    for (const pendingToken of [expired, `${forged}.${sig}`, `${payload}.${sig.slice(0, -2)}AA`, "garbage"]) {
      expect(await login({ ...base, surface: "dealer", email: "", pendingToken, totpCode })).toEqual({
        ok: false,
        error: "invalid",
      });
    }
    expect(await login({ ...base, surface: "backoffice", email: "", pendingToken: valid, totpCode })).toEqual({
      ok: false,
      error: "invalid",
    });
  });
});

describe("audit log", () => {
  it("writes success and failure rows with action, actor and surface", async () => {
    await login({ ...base, surface: "dealer", email: "owner@demo.si", password: "x" });
    await login({ ...base, surface: "dealer", email: "owner@demo.si", password: PASSWORD });
    await login({ ...base, surface: "backoffice", email: "ghost@drivebook.si", password: "x" });

    const rows = await db.select().from(auditLog).orderBy(auditLog.createdAt);
    expect(rows.map((r) => r.action)).toEqual(["auth.login.failure", "auth.login.success", "auth.login.failure"]);
    expect(rows[0]).toMatchObject({
      actorKind: "dealer_user",
      actorId: s.owner.id,
      dealerId: s.dealer.id,
      data: { surface: "dealer", email: "owner@demo.si", ip: base.ip, reason: "wrong_password" },
    });
    expect(rows[1]).toMatchObject({ actorKind: "dealer_user", actorId: s.owner.id, data: { surface: "dealer" } });
    expect(rows[2]).toMatchObject({
      actorKind: "backoffice_user",
      actorId: null,
      dealerId: null,
      data: { surface: "backoffice", email: "ghost@drivebook.si", reason: "unknown_email" },
    });
  });

  it("logout destroys the session and writes auth.logout", async () => {
    const r = await login({ ...base, surface: "dealer", email: "owner@demo.si", password: PASSWORD });
    if (!r.ok) throw new Error("login failed");
    jar.set(SESSION_COOKIE.dealer, { value: r.token });
    await logout("dealer");
    expect(await validateSessionToken("dealer", r.token)).toBeNull();
    expect(jar.get(SESSION_COOKIE.dealer)?.value).toBe("");
    const [last] = await db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(1);
    expect(last).toMatchObject({ action: "auth.logout", actorId: s.owner.id, dealerId: s.dealer.id });
  });
});
