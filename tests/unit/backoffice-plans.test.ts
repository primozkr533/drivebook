// Real-database tests: start Postgres with `docker compose up -d db` (uses TEST_DATABASE_URL).
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { auditLog, dealerLicenceHistory, dealers, plans } from "@/db/schema";
import type { BackofficeSessionUser } from "@/server/auth/session";
import { getTestDb, truncateAll } from "../setup/db";

const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined) }),
  headers: async () => new Headers(),
}));
vi.mock("next/navigation", () => ({
  redirect: (location: string) => {
    throw new Error(`redirect ${location}`);
  },
}));

const sessions = new Map<string, BackofficeSessionUser>();
vi.mock("@/server/auth/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/auth/session")>();
  return {
    ...actual,
    getCurrentSession: async () => {
      const user = sessions.get(jar.get(actual.SESSION_COOKIE.backoffice) ?? "");
      return user ? { session: { id: "s" }, user } : null;
    },
  };
});

const { SESSION_COOKIE } = await import("@/server/auth/session");
const { ForbiddenError } = await import("@/server/auth/permissions");
const { setDbForTests } = await import("@/server/data/db");
const { DEFAULT_PLAN_CODE } = await import("@/db/seed");
const { createPlan, deletePlan, getPlan, listPlans, updatePlan } = await import("@/server/data/backoffice/plans");

const db = getTestDb();

const user = { name: "User", status: "active" };
const superadmin: BackofficeSessionUser = { ...user, id: "u-admin", email: "admin@drivebook.si", role: "superadmin" };
const support: BackofficeSessionUser = { ...user, id: "u-support", email: "support@drivebook.si", role: "support" };

function signIn(u: BackofficeSessionUser): void {
  sessions.set(`tok-${u.id}`, u);
  jar.set(SESSION_COOKIE.backoffice, `tok-${u.id}`);
}

async function seedPlan(code: string, name: string) {
  const [plan] = await db
    .insert(plans)
    .values({ code, name, maxCars: 20, maxUsers: 5, monthlySmsQuota: 100, priceEurCents: 4900 })
    .returning();
  return plan;
}

async function seedDealer(planId: string, slug: string) {
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
  return dealer;
}

const audits = () => db.select().from(auditLog);

beforeAll(() => setDbForTests(db));
beforeEach(async () => {
  await truncateAll();
  jar.clear();
  sessions.clear();
});
afterAll(async () => {
  setDbForTests(undefined);
  await db.$client.end();
});

describe("createPlan", () => {
  it("defaults the SMS quota to 300 and audits plan.create", async () => {
    signIn(superadmin);
    const result = await createPlan({ name: "  Premium ", maxUsers: 3 });
    expect(result).toMatchObject({ ok: true, plan: { name: "Premium", monthlySmsQuota: 300, maxUsers: 3, notes: null } });
    if (!result.ok) throw new Error("expected ok");

    const [row] = await db.select().from(plans).where(eq(plans.id, result.plan.id));
    expect(row.monthlySmsQuota).toBe(300);
    expect(row.code).toBe("premium");
    expect(await audits()).toEqual([
      expect.objectContaining({
        actorId: superadmin.id,
        action: "plan.create",
        entity: "plan",
        entityId: row.id,
        dealerId: null,
        data: { after: { name: "Premium", monthlySmsQuota: 300, maxUsers: 3, notes: null } },
      }),
    ]);
  });

  it("returns 'taken' on name for a duplicate (case-insensitive) and writes nothing", async () => {
    signIn(superadmin);
    await seedPlan("basic", "Basic");
    expect(await createPlan({ name: "basic", maxUsers: 3 })).toEqual({ ok: false, field: "name", error: "taken" });
    expect(await db.select().from(plans)).toHaveLength(1);
    expect(await audits()).toHaveLength(0);
  });

  it("validates name, quota and max users", async () => {
    signIn(superadmin);
    expect(await createPlan({ name: " ", maxUsers: 3 })).toEqual({ ok: false, field: "name", error: "required" });
    expect(await createPlan({ name: "A", monthlySmsQuota: -1, maxUsers: 3 })).toEqual({
      ok: false,
      field: "monthlySmsQuota",
      error: "invalid",
    });
    expect(await createPlan({ name: "A", monthlySmsQuota: 1.5, maxUsers: 3 })).toMatchObject({ field: "monthlySmsQuota" });
    expect(await createPlan({ name: "A", maxUsers: 0 })).toEqual({ ok: false, field: "maxUsers", error: "invalid" });
    expect(await createPlan({ name: "A", maxUsers: 2.5 })).toMatchObject({ field: "maxUsers" });
    expect(await createPlan({ name: "A", monthlySmsQuota: 0, maxUsers: 1 })).toMatchObject({ ok: true });
    expect(await db.select().from(plans)).toHaveLength(1);
  });

  it("gives a plan whose code is taken a distinct code", async () => {
    signIn(superadmin);
    await seedPlan("pro", "Professional");
    const result = await createPlan({ name: "Pro", maxUsers: 2 });
    if (!result.ok) throw new Error("expected ok");
    expect(result.plan.code).toMatch(/^pro-[a-z0-9]{6}$/);
  });
});

describe("updatePlan", () => {
  it("updates and audits plan.update with the changed values in the same transaction", async () => {
    signIn(superadmin);
    const plan = await seedPlan("basic", "Basic");
    const result = await updatePlan(plan.id, { name: "Basic", monthlySmsQuota: 500, maxUsers: 5, notes: "Za manjše" });
    expect(result).toMatchObject({ ok: true, plan: { monthlySmsQuota: 500, notes: "Za manjše" } });
    expect(await audits()).toEqual([
      expect.objectContaining({
        action: "plan.update",
        entityId: plan.id,
        data: { before: { monthlySmsQuota: 100, notes: null }, after: { monthlySmsQuota: 500, notes: "Za manjše" } },
      }),
    ]);
  });

  it("refuses a name used by another plan but allows keeping its own", async () => {
    signIn(superadmin);
    const basic = await seedPlan("basic", "Basic");
    await seedPlan("pro", "Pro");
    expect(await updatePlan(basic.id, { name: "PRO", monthlySmsQuota: 1, maxUsers: 1, notes: null })).toEqual({
      ok: false,
      field: "name",
      error: "taken",
    });
    expect(await audits()).toHaveLength(0);
    expect(await updatePlan(basic.id, { name: "basic", monthlySmsQuota: 1, maxUsers: 1, notes: null })).toMatchObject({ ok: true });
  });

  it("returns notFound for an unknown or malformed id", async () => {
    signIn(superadmin);
    const input = { name: "X", monthlySmsQuota: 1, maxUsers: 1, notes: null };
    expect(await updatePlan("00000000-0000-0000-0000-000000000000", input)).toEqual({ ok: false, error: "notFound" });
    expect(await updatePlan("nope", input)).toEqual({ ok: false, error: "notFound" });
    expect(await audits()).toHaveLength(0);
  });
});

describe("deletePlan", () => {
  it("deletes an unused plan and audits plan.delete", async () => {
    signIn(superadmin);
    const plan = await seedPlan("basic", "Basic");
    expect(await deletePlan(plan.id)).toEqual({ ok: true });
    expect(await db.select().from(plans)).toHaveLength(0);
    expect(await audits()).toEqual([
      expect.objectContaining({
        action: "plan.delete",
        entityId: plan.id,
        data: { before: { name: "Basic", monthlySmsQuota: 100, maxUsers: 5, notes: null } },
      }),
    ]);
  });

  it("refuses a plan assigned to a dealer or in a dealer's licence history", async () => {
    signIn(superadmin);
    const used = await seedPlan("basic", "Basic");
    await seedDealer(used.id, "alpha");
    expect(await deletePlan(used.id)).toEqual({ ok: false, error: "inUse" });

    const past = await seedPlan("old", "Old");
    const dealer = await seedDealer(used.id, "beta");
    await db.insert(dealerLicenceHistory).values({
      dealerId: dealer.id,
      planId: past.id,
      validFrom: new Date("2025-01-01T00:00:00Z"),
      validTo: new Date("2025-06-01T00:00:00Z"),
      validUntil: "2025-06-01",
      note: "",
    });
    expect(await deletePlan(past.id)).toEqual({ ok: false, error: "inUse" });

    expect(await db.select().from(plans)).toHaveLength(2);
    expect(await audits()).toHaveLength(0);
  });

  it("refuses the seeded default plan", async () => {
    signIn(superadmin);
    const plan = await seedPlan(DEFAULT_PLAN_CODE, "Standard");
    expect(await deletePlan(plan.id)).toEqual({ ok: false, error: "default" });
    expect(await db.select().from(plans)).toHaveLength(1);
  });
});

describe("reads and Support access", () => {
  it("lists plans with dealer counts and the default flag, and gets one plan", async () => {
    const standard = await seedPlan(DEFAULT_PLAN_CODE, "Standard");
    const basic = await seedPlan("basic", "Basic");
    await seedDealer(standard.id, "alpha");
    await seedDealer(standard.id, "beta");
    signIn(support);

    expect(await listPlans()).toEqual([
      expect.objectContaining({ id: basic.id, name: "Basic", dealerCount: 0, isDefault: false }),
      expect.objectContaining({ id: standard.id, name: "Standard", dealerCount: 2, isDefault: true }),
    ]);
    expect(await getPlan(basic.id)).toMatchObject({ name: "Basic", monthlySmsQuota: 100, maxUsers: 5 });
    expect(await getPlan("nope")).toBeNull();
  });

  it("gives Support ForbiddenError on every write, even with invalid input", async () => {
    const plan = await seedPlan("basic", "Basic");
    signIn(support);
    const input = { name: "X", monthlySmsQuota: 1, maxUsers: 1, notes: null };

    await expect(createPlan({ name: "New", maxUsers: 1 })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(createPlan({ name: "", maxUsers: 0 })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(updatePlan(plan.id, input)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(deletePlan(plan.id)).rejects.toBeInstanceOf(ForbiddenError);
    expect(await db.select().from(plans)).toEqual([expect.objectContaining({ name: "Basic" })]);
    expect(await audits()).toHaveLength(0);
  });
});
