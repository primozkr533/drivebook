// Real-database tests: start Postgres with `docker compose up -d db` (uses TEST_DATABASE_URL).
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { backofficeSessions, backofficeUsers, dealers, dealerSessions, dealerUsers, plans } from "@/db/schema";
import { hashToken } from "@/server/auth/tokens";
import { setDbForTests } from "@/server/data/db";
import { getTestDb, truncateAll } from "../setup/db";

const jar = new Map<string, { value: string; options?: unknown }>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)!.value } : undefined),
    set: (name: string, value: string, options?: unknown) => void jar.set(name, { value, options }),
  }),
}));

const {
  SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
  createSession,
  deactivateUser,
  destroyCurrentSession,
  getCurrentSession,
  getDealerContextFromSession,
  refreshSessionCookie,
  revokeUserSessions,
  setSessionCookie,
  validateSessionToken,
} = await import("@/server/auth/session");

const db = getTestDb();
const DAY_MS = 24 * 60 * 60 * 1000;
const meta = { ip: "127.0.0.1", userAgent: "vitest" };

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
  const [dealerUser] = await db
    .insert(dealerUsers)
    .values({ dealerId: dealer.id, email: "owner@demo.si", name: "Owner", role: "owner", status: "active" })
    .returning();
  const [backofficeUser] = await db
    .insert(backofficeUsers)
    .values({ email: "admin@drivebook.si", name: "Admin", role: "superadmin", status: "active" })
    .returning();
  return { dealer, dealerUser, backofficeUser };
}

let seeded: Awaited<ReturnType<typeof seedUsers>>;

beforeAll(() => setDbForTests(db));
afterAll(() => setDbForTests(undefined));
beforeEach(async () => {
  jar.clear();
  await truncateAll();
  seeded = await seedUsers();
});

describe("cookie contract", () => {
  it("uses host-only, secure, lax, 30-day cookies with per-surface names", async () => {
    expect(SESSION_COOKIE).toEqual({ dealer: "db_app_session", backoffice: "db_admin_session" });
    expect(SESSION_COOKIE_OPTIONS).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 30 * 24 * 60 * 60,
    });
    expect(SESSION_COOKIE_OPTIONS).not.toHaveProperty("domain");

    await setSessionCookie("dealer", "tok");
    expect(jar.get("db_app_session")).toEqual({ value: "tok", options: SESSION_COOKIE_OPTIONS });
  });
});

describe("createSession / validateSessionToken", () => {
  it("validates a fresh session, stores only the hash and records last login", async () => {
    const token = await createSession("dealer", seeded.dealerUser.id, meta);
    const result = await validateSessionToken("dealer", token);
    expect(result?.user.id).toBe(seeded.dealerUser.id);
    expect(result?.session.refreshed).toBe(false);

    const [row] = await db.select().from(dealerSessions);
    expect(row.tokenHash).toBe(hashToken(token));
    expect(row.tokenHash).not.toBe(token);
    expect(row.expiresAt.getTime() - Date.now()).toBeGreaterThan(29 * DAY_MS);
    const [user] = await db.select().from(dealerUsers).where(eq(dealerUsers.id, seeded.dealerUser.id));
    expect(user.lastLoginAt).not.toBeNull();
  });

  it("returns null for expired and unknown tokens", async () => {
    const token = await createSession("dealer", seeded.dealerUser.id, meta);
    await db.update(dealerSessions).set({ expiresAt: new Date(Date.now() - 1000) });
    expect(await validateSessionToken("dealer", token)).toBeNull();
    expect(await validateSessionToken("dealer", "nope")).toBeNull();
    expect(await validateSessionToken("dealer", "")).toBeNull();
  });

  it("never validates a token on the other surface", async () => {
    const dealerToken = await createSession("dealer", seeded.dealerUser.id, meta);
    const backofficeToken = await createSession("backoffice", seeded.backofficeUser.id, meta);
    expect(await validateSessionToken("backoffice", dealerToken)).toBeNull();
    expect(await validateSessionToken("dealer", backofficeToken)).toBeNull();
    expect((await validateSessionToken("backoffice", backofficeToken))?.user.id).toBe(seeded.backofficeUser.id);
  });

  it("rejects sessions of users that are not active", async () => {
    const token = await createSession("dealer", seeded.dealerUser.id, meta);
    await db.update(dealerUsers).set({ status: "invited" });
    expect(await validateSessionToken("dealer", token)).toBeNull();
  });
});

describe("sliding expiry", () => {
  it("extends expires_at when last_seen_at is older than an hour", async () => {
    const token = await createSession("dealer", seeded.dealerUser.id, meta);
    const stale = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const nearExpiry = new Date(Date.now() + DAY_MS);
    await db.update(dealerSessions).set({ lastSeenAt: stale, expiresAt: nearExpiry });

    const result = await validateSessionToken("dealer", token);
    expect(result?.session.refreshed).toBe(true);
    const [row] = await db.select().from(dealerSessions);
    expect(row.expiresAt.getTime() - Date.now()).toBeGreaterThan(29 * DAY_MS);
    expect(row.lastSeenAt.getTime()).toBeGreaterThan(stale.getTime());
  });

  it("leaves expires_at alone when last_seen_at is recent", async () => {
    const token = await createSession("dealer", seeded.dealerUser.id, meta);
    const recent = new Date(Date.now() - 10 * 60 * 1000);
    const nearExpiry = new Date(Date.now() + DAY_MS);
    await db.update(dealerSessions).set({ lastSeenAt: recent, expiresAt: nearExpiry });

    const result = await validateSessionToken("dealer", token);
    expect(result?.session.refreshed).toBe(false);
    const [row] = await db.select().from(dealerSessions);
    expect(row.expiresAt.getTime()).toBe(nearExpiry.getTime());
    expect(row.lastSeenAt.getTime()).toBe(recent.getTime());
  });

  it("getCurrentSession leaves the cookie to the proxy", async () => {
    const token = await createSession("dealer", seeded.dealerUser.id, meta);
    await db.update(dealerSessions).set({ lastSeenAt: new Date(Date.now() - 2 * 60 * 60 * 1000) });
    jar.set(SESSION_COOKIE.dealer, { value: token });
    expect((await getCurrentSession("dealer"))?.session.refreshed).toBe(true);
    expect(jar.get(SESSION_COOKIE.dealer)).toEqual({ value: token });
  });
});

describe("refreshSessionCookie", () => {
  it("slides expires_at of a back-dated session and returns the new expiry", async () => {
    const token = await createSession("dealer", seeded.dealerUser.id, meta);
    const nearExpiry = new Date(Date.now() + DAY_MS);
    await db.update(dealerSessions).set({ lastSeenAt: new Date(Date.now() - 2 * 60 * 60 * 1000), expiresAt: nearExpiry });

    const expiresAt = await refreshSessionCookie("dealer", token);
    const [row] = await db.select().from(dealerSessions);
    expect(expiresAt?.getTime()).toBe(row.expiresAt.getTime());
    expect(row.expiresAt.getTime() - Date.now()).toBeGreaterThan(29 * DAY_MS);
  });

  it("returns null for a fresh session without touching it", async () => {
    const token = await createSession("backoffice", seeded.backofficeUser.id, meta);
    const [before] = await db.select().from(backofficeSessions);
    expect(await refreshSessionCookie("backoffice", token)).toBeNull();
    const [after] = await db.select().from(backofficeSessions);
    expect(after.expiresAt.getTime()).toBe(before.expiresAt.getTime());
  });

  it("returns null for unknown, expired, cross-surface and deactivated-user sessions", async () => {
    const stale = new Date(Date.now() - 2 * 60 * 60 * 1000);
    expect(await refreshSessionCookie("dealer", "nope")).toBeNull();
    expect(await refreshSessionCookie("dealer", "")).toBeNull();

    const dealerToken = await createSession("dealer", seeded.dealerUser.id, meta);
    const backofficeToken = await createSession("backoffice", seeded.backofficeUser.id, meta);
    await db.update(dealerSessions).set({ lastSeenAt: stale });
    await db.update(backofficeSessions).set({ lastSeenAt: stale });
    expect(await refreshSessionCookie("backoffice", dealerToken)).toBeNull();
    expect(await refreshSessionCookie("dealer", backofficeToken)).toBeNull();

    await db.update(dealerSessions).set({ expiresAt: new Date(Date.now() - 1000) });
    expect(await refreshSessionCookie("dealer", dealerToken)).toBeNull();

    await db.update(backofficeUsers).set({ status: "deactivated" });
    expect(await refreshSessionCookie("backoffice", backofficeToken)).toBeNull();
    const [row] = await db.select().from(backofficeSessions);
    expect(row.lastSeenAt.getTime()).toBe(stale.getTime());
  });
});

describe("getCurrentSession", () => {
  it("reads only its own surface's cookie", async () => {
    const dealerToken = await createSession("dealer", seeded.dealerUser.id, meta);
    jar.set(SESSION_COOKIE.dealer, { value: dealerToken });
    expect((await getCurrentSession("dealer"))?.user.id).toBe(seeded.dealerUser.id);
    expect(await getCurrentSession("backoffice")).toBeNull();

    // Even a dealer token planted in the backoffice cookie never hits dealer_sessions.
    jar.set(SESSION_COOKIE.backoffice, { value: dealerToken });
    expect(await getCurrentSession("backoffice")).toBeNull();
  });
});

describe("logout and revocation", () => {
  it("destroyCurrentSession deletes the row and clears the cookie", async () => {
    const token = await createSession("backoffice", seeded.backofficeUser.id, meta);
    jar.set(SESSION_COOKIE.backoffice, { value: token });
    await destroyCurrentSession("backoffice");
    expect(await db.select().from(backofficeSessions)).toHaveLength(0);
    expect(jar.get(SESSION_COOKIE.backoffice)).toMatchObject({ value: "", options: { maxAge: 0 } });
  });

  it("revokeUserSessions can keep the current session", async () => {
    const keep = await createSession("dealer", seeded.dealerUser.id, meta);
    const drop = await createSession("dealer", seeded.dealerUser.id, meta);
    const kept = await validateSessionToken("dealer", keep);
    await revokeUserSessions("dealer", seeded.dealerUser.id, { exceptSessionId: kept!.session.id });
    expect(await validateSessionToken("dealer", drop)).toBeNull();
    expect(await validateSessionToken("dealer", keep)).not.toBeNull();

    await revokeUserSessions("dealer", seeded.dealerUser.id);
    expect(await validateSessionToken("dealer", keep)).toBeNull();
  });

  it("deactivateUser deletes all sessions and old tokens stop validating", async () => {
    const a = await createSession("dealer", seeded.dealerUser.id, meta);
    const b = await createSession("dealer", seeded.dealerUser.id, meta);
    await deactivateUser("dealer", seeded.dealerUser.id);

    expect(await db.select().from(dealerSessions)).toHaveLength(0);
    const [user] = await db.select().from(dealerUsers).where(eq(dealerUsers.id, seeded.dealerUser.id));
    expect(user.status).toBe("deactivated");
    expect(await validateSessionToken("dealer", a)).toBeNull();
    expect(await validateSessionToken("dealer", b)).toBeNull();
  });
});

describe("getDealerContextFromSession", () => {
  it("builds the context from the session user's dealer", async () => {
    const token = await createSession("dealer", seeded.dealerUser.id, meta);
    jar.set(SESSION_COOKIE.dealer, { value: token });
    const result = await getDealerContextFromSession();
    expect(result?.ctx.dealerId).toBe(seeded.dealerUser.dealerId);
    expect(result?.ctx.slug).toBe("demo");
    expect(result?.user).toEqual({ id: seeded.dealerUser.id, email: "owner@demo.si", role: "owner" });
    expect(result?.sessionId).toEqual(expect.any(String));
  });

  it("returns null without a dealer session", async () => {
    const token = await createSession("backoffice", seeded.backofficeUser.id, meta);
    jar.set(SESSION_COOKIE.backoffice, { value: token });
    expect(await getDealerContextFromSession()).toBeNull();
  });
});
