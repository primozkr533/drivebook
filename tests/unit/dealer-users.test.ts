// Real-database tests: start Postgres with `docker compose up -d db` (uses TEST_DATABASE_URL).
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { auditLog, dealerSessions, dealerUsers, dealers, messageLog, plans } from "@/db/schema";
import { resetConfigForTests } from "@/lib/config";
import type { DealerSessionUser } from "@/server/auth/session";
import type { DealerContext } from "@/server/data/context";
import { getTestDb, truncateAll } from "../setup/db";

let current: DealerSessionUser | null = null;
let currentCtx: DealerContext | null = null;
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {} }),
  headers: async () => new Headers(),
}));
vi.mock("next/navigation", () => ({
  redirect: (location: string) => {
    throw new Error(`redirect ${location}`);
  },
}));
vi.mock("@/server/auth/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/auth/session")>();
  return {
    ...actual,
    getDealerContextFromSession: async () =>
      current && currentCtx
        ? { ctx: currentCtx, user: { id: current.id, email: current.email, role: current.role }, sessionId: "s" }
        : null,
  };
});

const { ForbiddenError } = await import("@/server/auth/permissions");
const { createSession, validateSessionToken } = await import("@/server/auth/session");
const { inspectLinkToken } = await import("@/server/auth/links");
const { setDbForTests } = await import("@/server/data/db");
const { resolveDealerSlug } = await import("@/server/data/dealers");
const { drainNotificationsForTest, stopBossForTests } = await import("@/server/notify/queue");
const { changeDealerUserRole, deactivateDealerUser, inviteDealerUser, listDealerUsers, reactivateDealerUser } =
  await import("@/server/data/dealer-users");

const db = getTestDb();
const previousAppEnv = process.env.APP_ENV;
const meta = { ip: "127.0.0.1", userAgent: "vitest" };

async function seedDealer(slug: string, planId: string) {
  const [dealer] = await db
    .insert(dealers)
    .values({
      slug,
      name: slug,
      legalName: `${slug} d.o.o.`,
      addressLine: "Dunajska cesta 1",
      postalCode: "1000",
      city: "Ljubljana",
      phone: "+38611234567",
      email: `info@${slug}.si`,
      primaryColor: "#E4572E",
      planId,
    })
    .returning();
  const resolved = await resolveDealerSlug(slug);
  if (resolved.kind !== "current") throw new Error("dealer not found");
  return { dealer, ctx: resolved.ctx };
}

async function seed(maxUsers: number | null = 5) {
  const [plan] = await db
    .insert(plans)
    .values({ code: "basic", name: "Basic", maxCars: 20, maxUsers, priceEurCents: 4900 })
    .returning();
  const a = await seedDealer("alfa", plan.id);
  const b = await seedDealer("beta", plan.id);
  const [owner, sales] = await db
    .insert(dealerUsers)
    .values([
      { dealerId: a.dealer.id, email: "owner@alfa.si", name: "Ana", role: "owner", status: "active", passwordHash: "x" },
      { dealerId: a.dealer.id, email: "sales@alfa.si", name: "Bor", role: "salesperson", status: "active", passwordHash: "x" },
    ])
    .returning();
  const [otherOwner] = await db
    .insert(dealerUsers)
    .values({ dealerId: b.dealer.id, email: "owner@beta.si", name: "Cene", role: "owner", status: "active", passwordHash: "x" })
    .returning();
  return { plan, a, b, owner, sales, otherOwner };
}

let s: Awaited<ReturnType<typeof seed>>;

const signInAs = (u: typeof s.owner) => {
  current = { id: u.id, email: u.email, name: u.name, role: u.role, status: u.status, dealerId: u.dealerId };
  currentCtx = u.dealerId === s.a.dealer.id ? s.a.ctx : s.b.ctx;
};

const setMaxUsers = (maxUsers: number | null) => db.update(plans).set({ maxUsers }).where(eq(plans.id, s.plan.id));

const userById = async (id: string) => (await db.select().from(dealerUsers).where(eq(dealerUsers.id, id)))[0];

beforeAll(() => {
  process.env.APP_ENV = "test";
  resetConfigForTests();
  setDbForTests(db);
});
beforeEach(async () => {
  await truncateAll();
  await drainNotificationsForTest();
  await truncateAll();
  current = null;
  currentCtx = null;
  s = await seed();
  signInAs(s.owner);
});
afterAll(async () => {
  await stopBossForTests();
  setDbForTests(undefined);
  if (previousAppEnv === undefined) delete process.env.APP_ENV;
  else process.env.APP_ENV = previousAppEnv;
  resetConfigForTests();
});

describe("listDealerUsers", () => {
  it("lists only this dealer's users with the plan limit and invited + active usage", async () => {
    const lastLoginAt = new Date("2026-10-01T08:00:00Z");
    await db.update(dealerUsers).set({ lastLoginAt }).where(eq(dealerUsers.id, s.owner.id));
    await db.insert(dealerUsers).values([
      { dealerId: s.a.dealer.id, email: "inv@alfa.si", name: "Cvetka", role: "salesperson", status: "invited" },
      { dealerId: s.a.dealer.id, email: "old@alfa.si", name: "Dušan", role: "salesperson", status: "deactivated" },
    ]);

    const list = await listDealerUsers(s.a.ctx);
    expect(list.users.map((u) => u.email)).toEqual(["owner@alfa.si", "sales@alfa.si", "inv@alfa.si", "old@alfa.si"]);
    expect(list.users[0]).toEqual({
      id: s.owner.id,
      name: "Ana",
      email: "owner@alfa.si",
      role: "owner",
      status: "active",
      lastLoginAt,
    });
    expect(list).toMatchObject({ maxUsers: 5, used: 3 });
  });

  it("reports null maxUsers for an unlimited plan", async () => {
    await setMaxUsers(null);
    expect(await listDealerUsers(s.a.ctx)).toMatchObject({ maxUsers: null, used: 2 });
  });
});

describe("inviteDealerUser", () => {
  it("creates an invited user, writes audit_log and queues exactly one invitation e-mail after commit", async () => {
    const result = await inviteDealerUser(s.a.ctx, { email: " Nova@Alfa.SI ", name: " Nova ", role: "salesperson" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(await userById(result.userId)).toMatchObject({
      dealerId: s.a.dealer.id,
      email: "nova@alfa.si",
      name: "Nova",
      role: "salesperson",
      status: "invited",
      passwordHash: null,
    });
    const audits = await db.select().from(auditLog);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      dealerId: s.a.dealer.id,
      actorKind: "dealer_user",
      actorId: s.owner.id,
      action: "dealer_user.invite",
      entity: "dealer_user",
      entityId: result.userId,
    });

    expect(result.link).toMatch(/^https?:\/\/app\.[^/]+\/set-password\//);
    expect(await inspectLinkToken("dealer", "invite", result.link.split("/").pop()!)).toBe("valid");
    const logs = await db.select().from(messageLog);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ channel: "email", template: "invitation", recipient: "nova@alfa.si" });
    await drainNotificationsForTest();
    expect(await db.select().from(messageLog)).toHaveLength(1);
  });

  it("returns 'taken' for an active or invited e-mail without writing anything", async () => {
    expect(await inviteDealerUser(s.a.ctx, { email: "SALES@alfa.si", name: "X", role: "owner" })).toEqual({
      ok: false,
      error: "taken",
    });
    const first = await inviteDealerUser(s.a.ctx, { email: "nova@alfa.si", name: "Nova", role: "salesperson" });
    expect(first.ok).toBe(true);
    expect(await inviteDealerUser(s.a.ctx, { email: "nova@alfa.si", name: "Nova", role: "owner" })).toEqual({
      ok: false,
      error: "taken",
    });
    expect(await db.select().from(auditLog)).toHaveLength(1);
    expect(await db.select().from(messageLog)).toHaveLength(1);
  });

  it("returns 'taken' for another dealer's user, even a deactivated one", async () => {
    await db.update(dealerUsers).set({ status: "deactivated" }).where(eq(dealerUsers.id, s.otherOwner.id));
    expect(await inviteDealerUser(s.a.ctx, { email: "owner@beta.si", name: "X", role: "owner" })).toEqual({
      ok: false,
      error: "taken",
    });
    expect((await userById(s.otherOwner.id)).dealerId).toBe(s.b.dealer.id);
  });

  it("re-invites a deactivated user of this dealer with a fresh link", async () => {
    await db
      .update(dealerUsers)
      .set({ status: "deactivated", totpSecretEnc: "enc", totpEnabledAt: new Date() })
      .where(eq(dealerUsers.id, s.sales.id));

    const result = await inviteDealerUser(s.a.ctx, { email: "sales@alfa.si", name: "Bor Novak", role: "owner" });
    expect(result).toMatchObject({ ok: true, userId: s.sales.id });
    expect(await userById(s.sales.id)).toMatchObject({
      name: "Bor Novak",
      role: "owner",
      status: "invited",
      passwordHash: null,
      totpSecretEnc: null,
      totpEnabledAt: null,
    });
    const [entry] = await db.select().from(auditLog);
    expect(entry).toMatchObject({ action: "dealer_user.reinvite", entityId: s.sales.id });
    expect(await db.select().from(messageLog)).toHaveLength(1);
  });

  it("validates e-mail, name and role", async () => {
    expect(await inviteDealerUser(s.a.ctx, { email: "nope", name: "X", role: "owner" })).toEqual({
      ok: false,
      error: "email",
    });
    expect(await inviteDealerUser(s.a.ctx, { email: "a@alfa.si", name: "  ", role: "owner" })).toEqual({
      ok: false,
      error: "name",
    });
    expect(await inviteDealerUser(s.a.ctx, { email: "a@alfa.si", name: "x".repeat(101), role: "owner" })).toEqual({
      ok: false,
      error: "name",
    });
    expect(
      await inviteDealerUser(s.a.ctx, { email: "a@alfa.si", name: "X", role: "admin" as unknown as "owner" }),
    ).toEqual({ ok: false, error: "role" });
    expect(await db.select().from(auditLog)).toHaveLength(0);
  });
});

describe("plan user limit", () => {
  beforeEach(async () => {
    await setMaxUsers(2);
  });

  it("refuses invites at the limit and doesn't count deactivated users", async () => {
    expect(await inviteDealerUser(s.a.ctx, { email: "nova@alfa.si", name: "Nova", role: "salesperson" })).toEqual({
      ok: false,
      error: "limit_reached",
    });
    expect(await db.select().from(messageLog)).toHaveLength(0);

    await db.update(dealerUsers).set({ status: "deactivated" }).where(eq(dealerUsers.id, s.sales.id));
    const result = await inviteDealerUser(s.a.ctx, { email: "nova@alfa.si", name: "Nova", role: "salesperson" });
    expect(result.ok).toBe(true);
  });

  it("also applies when re-inviting a deactivated user", async () => {
    await db.update(dealerUsers).set({ status: "deactivated" }).where(eq(dealerUsers.id, s.sales.id));
    await db
      .insert(dealerUsers)
      .values({ dealerId: s.a.dealer.id, email: "inv@alfa.si", name: "Inv", role: "salesperson", status: "invited" });
    expect(await inviteDealerUser(s.a.ctx, { email: "sales@alfa.si", name: "Bor", role: "salesperson" })).toEqual({
      ok: false,
      error: "limit_reached",
    });
  });

  it("refuses reactivation at the limit", async () => {
    const [old] = await db
      .insert(dealerUsers)
      .values({ dealerId: s.a.dealer.id, email: "old@alfa.si", name: "Old", role: "salesperson", status: "deactivated" })
      .returning();
    expect(await reactivateDealerUser(s.a.ctx, old.id)).toEqual({ ok: false, error: "limit_reached" });
    expect((await userById(old.id)).status).toBe("deactivated");
    expect(await db.select().from(auditLog)).toHaveLength(0);
  });
});

describe("last Owner rule", () => {
  it("refuses to demote or deactivate the only active Owner", async () => {
    expect(await changeDealerUserRole(s.a.ctx, s.owner.id, "salesperson")).toEqual({ ok: false, error: "last_owner" });
    expect(await deactivateDealerUser(s.a.ctx, s.owner.id)).toEqual({ ok: false, error: "last_owner" });
    expect(await userById(s.owner.id)).toMatchObject({ role: "owner", status: "active" });
    expect(await db.select().from(auditLog)).toHaveLength(0);
  });

  it("an invited Owner doesn't count as an active Owner", async () => {
    await db
      .insert(dealerUsers)
      .values({ dealerId: s.a.dealer.id, email: "inv@alfa.si", name: "Inv", role: "owner", status: "invited" });
    expect(await changeDealerUserRole(s.a.ctx, s.owner.id, "salesperson")).toEqual({ ok: false, error: "last_owner" });
  });

  it("allows demoting and deactivating an Owner when another active Owner remains", async () => {
    expect(await changeDealerUserRole(s.a.ctx, s.sales.id, "owner")).toEqual({ ok: true });
    expect(await changeDealerUserRole(s.a.ctx, s.owner.id, "salesperson")).toEqual({ ok: true });
    expect((await userById(s.owner.id)).role).toBe("salesperson");

    expect(await changeDealerUserRole(s.a.ctx, s.owner.id, "owner")).toEqual({ ok: true });
    expect(await deactivateDealerUser(s.a.ctx, s.sales.id)).toEqual({ ok: true });
    expect((await userById(s.sales.id)).status).toBe("deactivated");

    const actions = (await db.select().from(auditLog)).map((a) => a.action);
    expect(actions.filter((a) => a === "dealer_user.change_role")).toHaveLength(3);
    expect(actions).toContain("dealer_user.deactivate");
  });
});

describe("deactivate and reactivate", () => {
  it("deactivation revokes all of the user's sessions", async () => {
    const one = await createSession("dealer", s.sales.id, meta);
    const two = await createSession("dealer", s.sales.id, meta);
    const ownerSession = await createSession("dealer", s.owner.id, meta);

    expect(await deactivateDealerUser(s.a.ctx, s.sales.id)).toEqual({ ok: true });
    expect(await validateSessionToken("dealer", one)).toBeNull();
    expect(await validateSessionToken("dealer", two)).toBeNull();
    expect(await db.select().from(dealerSessions).where(eq(dealerSessions.userId, s.sales.id))).toHaveLength(0);
    expect(await validateSessionToken("dealer", ownerSession)).not.toBeNull();
    const [entry] = await db.select().from(auditLog);
    expect(entry).toMatchObject({ action: "dealer_user.deactivate", entityId: s.sales.id, actorId: s.owner.id });
  });

  it("reactivation restores 'active' for a user with a password, without an e-mail", async () => {
    await deactivateDealerUser(s.a.ctx, s.sales.id);
    expect(await reactivateDealerUser(s.a.ctx, s.sales.id)).toEqual({ ok: true, status: "active" });
    expect((await userById(s.sales.id)).status).toBe("active");
    expect(await db.select().from(messageLog)).toHaveLength(0);
  });

  it("reactivation of a user without a password sets 'invited' and sends a new invitation", async () => {
    const [old] = await db
      .insert(dealerUsers)
      .values({ dealerId: s.a.dealer.id, email: "old@alfa.si", name: "Old", role: "salesperson", status: "deactivated" })
      .returning();
    expect(await reactivateDealerUser(s.a.ctx, old.id)).toEqual({ ok: true, status: "invited" });
    expect((await userById(old.id)).status).toBe("invited");
    const logs = await db.select().from(messageLog);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ template: "invitation", recipient: "old@alfa.si" });
  });

  it("refuses to reactivate a user who isn't deactivated", async () => {
    expect(await reactivateDealerUser(s.a.ctx, s.sales.id)).toEqual({ ok: false, error: "not_deactivated" });
  });
});

describe("tenant isolation and roles", () => {
  it("returns not_found for another dealer's user and for unknown ids", async () => {
    await db.update(dealerUsers).set({ role: "salesperson" }).where(eq(dealerUsers.id, s.otherOwner.id));
    const missing = "00000000-0000-4000-8000-000000000000";
    for (const id of [s.otherOwner.id, missing, "not-a-uuid"]) {
      expect(await changeDealerUserRole(s.a.ctx, id, "owner")).toEqual({ ok: false, error: "not_found" });
      expect(await deactivateDealerUser(s.a.ctx, id)).toEqual({ ok: false, error: "not_found" });
      expect(await reactivateDealerUser(s.a.ctx, id)).toEqual({ ok: false, error: "not_found" });
    }
    expect(await userById(s.otherOwner.id)).toMatchObject({ role: "salesperson", status: "active" });
    expect(await db.select().from(auditLog)).toHaveLength(0);
  });

  it("throws ForbiddenError for a Salesperson and for a context of another dealer", async () => {
    signInAs(s.sales);
    await expect(listDealerUsers(s.a.ctx)).rejects.toThrow(ForbiddenError);
    await expect(inviteDealerUser(s.a.ctx, { email: "n@alfa.si", name: "N", role: "owner" })).rejects.toThrow(
      ForbiddenError,
    );
    await expect(changeDealerUserRole(s.a.ctx, s.sales.id, "owner")).rejects.toThrow(ForbiddenError);
    await expect(deactivateDealerUser(s.a.ctx, s.owner.id)).rejects.toThrow(ForbiddenError);
    await expect(reactivateDealerUser(s.a.ctx, s.owner.id)).rejects.toThrow(ForbiddenError);

    signInAs(s.owner);
    await expect(listDealerUsers(s.b.ctx)).rejects.toThrow(ForbiddenError);
    await expect(deactivateDealerUser(s.b.ctx, s.otherOwner.id)).rejects.toThrow(ForbiddenError);
  });
});
