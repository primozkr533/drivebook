// Real-database tests: start Postgres with `docker compose up -d db` (uses TEST_DATABASE_URL).
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { auditLog, dealerUsers, dealers, messageLog, plans } from "@/db/schema";
import { resetConfigForTests } from "@/lib/config";
import type { DealerContext } from "@/server/data/context";
import { getTestDb, truncateAll } from "../setup/db";

const session = vi.hoisted(() => ({
  current: null as { id: string; email: string; role: "owner" | "salesperson" } | null,
  ctx: null as DealerContext | null,
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {} }),
  headers: async () => new Headers({ "x-drivebook-base-path": "/_dev/app" }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("@/server/auth/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/auth/session")>()),
  getDealerContextFromSession: async () =>
    session.current && session.ctx ? { ctx: session.ctx, user: session.current, sessionId: "s" } : null,
}));

const { setDbForTests } = await import("@/server/data/db");
const { resolveDealerSlug } = await import("@/server/data/dealers");
const { drainNotificationsForTest, stopBossForTests } = await import("@/server/notify/queue");
const { changeDealerUserRoleAction, deactivateDealerUserAction, inviteDealerUserAction, reactivateDealerUserAction } =
  await import("@/app/dealer-admin/(app)/users/actions");

const db = getTestDb();
const previousAppEnv = process.env.APP_ENV;

const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
};

async function redirectOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
  } catch (error) {
    return (error as { url?: string }).url;
  }
  return undefined;
}

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

async function seed() {
  const [plan] = await db
    .insert(plans)
    .values({ code: "basic", name: "Basic", maxCars: 20, maxUsers: 5, priceEurCents: 4900 })
    .returning();
  const a = await seedDealer("alfa", plan.id);
  const b = await seedDealer("beta", plan.id);
  const [owner, sales, gone] = await db
    .insert(dealerUsers)
    .values([
      { dealerId: a.dealer.id, email: "owner@alfa.si", name: "Ana", role: "owner", status: "active", passwordHash: "x" },
      { dealerId: a.dealer.id, email: "sales@alfa.si", name: "Bor", role: "salesperson", status: "active", passwordHash: "x" },
      { dealerId: a.dealer.id, email: "old@alfa.si", name: "Dušan", role: "salesperson", status: "deactivated", passwordHash: "x" },
    ])
    .returning();
  const [otherSales, otherGone] = await db
    .insert(dealerUsers)
    .values([
      { dealerId: b.dealer.id, email: "sales@beta.si", name: "Cene", role: "salesperson", status: "active", passwordHash: "x" },
      { dealerId: b.dealer.id, email: "old@beta.si", name: "Eva", role: "salesperson", status: "deactivated", passwordHash: "x" },
    ])
    .returning();
  return { plan, a, b, owner, sales, gone, otherSales, otherGone };
}

let s: Awaited<ReturnType<typeof seed>>;

const signInAs = (u: typeof s.owner) => {
  session.current = { id: u.id, email: u.email, role: u.role };
  session.ctx = s.a.ctx;
};

const userById = async (id: string) => (await db.select().from(dealerUsers).where(eq(dealerUsers.id, id)))[0];
const snapshot = async () => (await db.select().from(dealerUsers)).map((u) => [u.email, u.role, u.status]).sort();

beforeAll(() => {
  process.env.APP_ENV = "test";
  resetConfigForTests();
  setDbForTests(db);
});
beforeEach(async () => {
  await truncateAll();
  await drainNotificationsForTest();
  await truncateAll();
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

describe("inviteDealerUserAction", () => {
  it("invites a new e-mail as an invited user, logs the invitation e-mail and redirects to the list", async () => {
    const url = await redirectOf(
      inviteDealerUserAction({}, form({ email: "Nova@Alfa.si", name: "Nova", role: "salesperson" })),
    );
    expect(url).toMatch(/^\/_dev\/app\/users\?saved=invite&t=[a-z0-9]+$/);
    const [created] = await db.select().from(dealerUsers).where(eq(dealerUsers.email, "nova@alfa.si"));
    expect(created).toMatchObject({ dealerId: s.a.dealer.id, name: "Nova", role: "salesperson", status: "invited" });
    const logs = await db.select().from(messageLog);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ channel: "email", template: "invitation", recipient: "nova@alfa.si" });
  });

  it.each([
    [{ email: "nope", name: "X", role: "owner" }, "email"],
    [{ email: "x@alfa.si", name: " ", role: "owner" }, "name"],
    [{ email: "x@alfa.si", name: "X", role: "superadmin" }, "role"],
    [{ email: "sales@beta.si", name: "X", role: "owner" }, "taken"],
  ])("returns the %j refusal %s with the submitted values and changes nothing", async (values, error) => {
    const before = await snapshot();
    expect(await inviteDealerUserAction({}, form(values))).toEqual({ values, error });
    expect(await snapshot()).toEqual(before);
    expect(await db.select().from(messageLog)).toHaveLength(0);
  });

  it("returns limit_reached for a forged submit at the plan limit", async () => {
    await db.update(plans).set({ maxUsers: 2 }).where(eq(plans.id, s.plan.id));
    const values = { email: "nova@alfa.si", name: "Nova", role: "owner" };
    const before = await snapshot();
    expect(await inviteDealerUserAction({}, form(values))).toEqual({ values, error: "limit_reached" });
    expect(await snapshot()).toEqual(before);
    expect(await db.select().from(messageLog)).toHaveLength(0);
  });
});

describe("per-user actions", () => {
  it("changes the role of the posted user and redirects", async () => {
    expect(await redirectOf(changeDealerUserRoleAction({}, form({ userId: s.sales.id, role: "owner" })))).toMatch(
      /^\/_dev\/app\/users\?saved=role&/,
    );
    expect((await userById(s.sales.id)).role).toBe("owner");
  });

  it("deactivates and reactivates the posted user", async () => {
    expect(await redirectOf(deactivateDealerUserAction({}, form({ userId: s.sales.id })))).toMatch(/saved=deactivate/);
    expect((await userById(s.sales.id)).status).toBe("deactivated");
    expect(await redirectOf(reactivateDealerUserAction({}, form({ userId: s.sales.id })))).toMatch(/saved=reactivate/);
    expect((await userById(s.sales.id)).status).toBe("active");
  });

  it("refuses to demote or deactivate the last active Owner and changes nothing", async () => {
    const before = await snapshot();
    expect(await changeDealerUserRoleAction({}, form({ userId: s.owner.id, role: "salesperson" }))).toEqual({
      error: "last_owner",
    });
    expect(await deactivateDealerUserAction({}, form({ userId: s.owner.id }))).toEqual({ error: "last_owner" });
    expect(await snapshot()).toEqual(before);
    expect(await db.select().from(auditLog)).toHaveLength(0);
  });

  it("returns limit_reached when reactivating at the plan limit", async () => {
    await db.update(plans).set({ maxUsers: 2 }).where(eq(plans.id, s.plan.id));
    expect(await reactivateDealerUserAction({}, form({ userId: s.gone.id }))).toEqual({ error: "limit_reached" });
    expect((await userById(s.gone.id)).status).toBe("deactivated");
  });

  it.each([
    ["change role", () => changeDealerUserRoleAction({}, form({ userId: s.otherSales.id, role: "owner" }))],
    ["deactivate", () => deactivateDealerUserAction({}, form({ userId: s.otherSales.id }))],
    ["reactivate", () => reactivateDealerUserAction({}, form({ userId: s.otherGone.id }))],
    ["deactivate (malformed id)", () => deactivateDealerUserAction({}, form({ userId: "not-a-uuid" }))],
  ])("%s with another dealer's user id is a 404 and changes nothing", async (_name, run) => {
    const before = await snapshot();
    await expect(run()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(await snapshot()).toEqual(before);
    expect(await db.select().from(auditLog)).toHaveLength(0);
  });

  it("refuses every action for a Salesperson with no change", async () => {
    signInAs(s.sales);
    const before = await snapshot();
    const values = { email: "nova@alfa.si", name: "Nova", role: "salesperson" };
    expect(await inviteDealerUserAction({}, form(values))).toEqual({ error: "forbidden" });
    expect(await changeDealerUserRoleAction({}, form({ userId: s.owner.id, role: "salesperson" }))).toEqual({
      error: "forbidden",
    });
    expect(await deactivateDealerUserAction({}, form({ userId: s.owner.id }))).toEqual({ error: "forbidden" });
    expect(await reactivateDealerUserAction({}, form({ userId: s.gone.id }))).toEqual({ error: "forbidden" });
    expect(await snapshot()).toEqual(before);
    expect(await db.select().from(auditLog)).toHaveLength(0);
    expect(await db.select().from(messageLog)).toHaveLength(0);
  });

  it("redirects to login without a session", async () => {
    session.current = null;
    expect(await redirectOf(deactivateDealerUserAction({}, form({ userId: s.sales.id })))).toBe("/_dev/app/login");
    expect((await userById(s.sales.id)).status).toBe("active");
  });
});
