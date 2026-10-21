// Real-database tests: start Postgres with `docker compose up -d db` (uses TEST_DATABASE_URL).
import { and, count, eq, type SQL } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  backofficeUsers,
  bookingRules,
  cars,
  dealerLicenceHistory,
  dealers,
  dealerSlugHistory,
  dealerUsers,
  openingHours,
  plans,
} from "@/db/schema";
import { DEMO_CAR_IDS, DEMO_DEALER_SLUG, DEMO_OLD_SLUG, DEMO_OWNER_EMAIL, runSeed } from "@/db/seed";
import { resetConfigForTests } from "@/lib/config";
import { getTestDb, truncateAll } from "../setup/db";

const db = getTestDb();

async function rowCount(table: PgTable, where?: SQL): Promise<number> {
  const [row] = await db.select({ n: count() }).from(table).where(where);
  return row.n;
}

async function demoDealer() {
  const [dealer] = await db.select().from(dealers).where(eq(dealers.slug, DEMO_DEALER_SLUG));
  return dealer;
}

beforeEach(truncateAll);

afterEach(() => {
  delete process.env.SEED_SUPERADMIN_EMAIL;
  resetConfigForTests();
});

afterAll(async () => {
  await db.$client.end();
});

describe("runSeed", () => {
  it("creates the demo dealer with its cars, hours, users, rules and old slug", async () => {
    await runSeed(db);

    const dealer = await demoDealer();
    expect(dealer).toMatchObject({ name: "Avtohiša Demo", status: "active", primaryColor: "#1F4FD8" });
    const [plan] = await db.select().from(plans).where(eq(plans.id, dealer.planId));
    expect(plan).toMatchObject({ code: "standard", monthlySmsQuota: 300, maxUsers: 10 });
    expect(dealer.licenceValidUntil).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const demoCars = await db.select().from(cars).where(eq(cars.dealerId, dealer.id));
    expect(demoCars.filter((car) => car.active)).toHaveLength(3);
    expect(demoCars.filter((car) => !car.active).map((car) => car.id)).toEqual([DEMO_CAR_IDS.peugeot308]);
    expect(demoCars.map((car) => car.id).sort()).toEqual(Object.values(DEMO_CAR_IDS).sort());

    const hours = await db.select().from(openingHours).where(eq(openingHours.dealerId, dealer.id));
    expect(hours).toHaveLength(11);
    expect([...new Set(hours.map((h) => h.isoWeekday))].sort()).toEqual([1, 2, 3, 4, 5, 6]);

    const users = await db.select().from(dealerUsers).where(eq(dealerUsers.dealerId, dealer.id));
    expect(users.map((u) => u.role).sort()).toEqual(["owner", "salesperson"]);
    expect(users.every((u) => u.passwordHash === null && u.status === "active")).toBe(true);

    expect(await rowCount(bookingRules, eq(bookingRules.dealerId, dealer.id))).toBe(1);
    expect(await rowCount(dealerLicenceHistory, eq(dealerLicenceHistory.dealerId, dealer.id))).toBe(1);

    const [oldSlug] = await db.select().from(dealerSlugHistory).where(eq(dealerSlugHistory.slug, DEMO_OLD_SLUG));
    expect(oldSlug.dealerId).toBe(dealer.id);
  });

  it("leaves image_key and logo_key null", async () => {
    await runSeed(db);
    const dealer = await demoDealer();
    expect(dealer.logoKey).toBeNull();
    const demoCars = await db.select().from(cars).where(eq(cars.dealerId, dealer.id));
    expect(demoCars.every((car) => car.imageKey === null)).toBe(true);
  });

  it("is idempotent", async () => {
    const tables = [plans, dealers, cars, dealerUsers, backofficeUsers, openingHours, dealerLicenceHistory];
    await runSeed(db);
    const first = await Promise.all(tables.map((table) => rowCount(table)));
    await runSeed(db);
    await runSeed(db);
    const again = await Promise.all(tables.map((table) => rowCount(table)));
    expect(again).toEqual(first);
    expect(first).toEqual([1, 1, 4, 2, 1, 11, 1]);
  });

  it("creates the default plan as Standard with 300 SMS and 10 users on an empty database", async () => {
    await runSeed(db);
    await runSeed(db);
    const all = await db.select().from(plans);
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ code: "standard", name: "Standard", monthlySmsQuota: 300, maxUsers: 10 });
  });

  it("never overwrites operator edits to the default plan", async () => {
    await runSeed(db);
    await db
      .update(plans)
      .set({ name: "Osnovni", monthlySmsQuota: 500, maxUsers: 25 })
      .where(eq(plans.code, "standard"));
    await runSeed(db);
    const [plan] = await db.select().from(plans).where(eq(plans.code, "standard"));
    expect(plan).toMatchObject({ name: "Osnovni", monthlySmsQuota: 500, maxUsers: 25 });
    expect((await demoDealer()).planId).toBe(plan.id);
  });

  it("succeeds when another plan has taken the name Standard", async () => {
    await runSeed(db);
    await db.update(plans).set({ name: "Osnovni" }).where(eq(plans.code, "standard"));
    await db.insert(plans).values({ code: "novi", name: "Standard", maxCars: 20, maxUsers: 5, priceEurCents: 2900 });
    await db.delete(dealers);
    await db.delete(backofficeUsers);

    await expect(runSeed(db)).resolves.toBeUndefined();

    const [defaultPlan] = await db.select().from(plans).where(eq(plans.code, "standard"));
    expect(defaultPlan.name).toBe("Osnovni");
    const dealer = await demoDealer();
    expect(dealer.planId).toBe(defaultPlan.id);
    expect(await rowCount(dealerUsers, eq(dealerUsers.dealerId, dealer.id))).toBe(2);
    expect(await rowCount(backofficeUsers, eq(backofficeUsers.role, "superadmin"))).toBe(1);
  });

  it("keeps rows the user added", async () => {
    await runSeed(db);
    const dealer = await demoDealer();
    await db.insert(cars).values({
      dealerId: dealer.id,
      make: "Fiat",
      model: "Panda",
      year: 2019,
      priceEur: 7900,
      body: "sedan",
      avtoNetUrl: "https://www.avto.net/Ads/details.asp?id=20000001",
    });
    await runSeed(db);
    expect(await rowCount(cars, eq(cars.dealerId, dealer.id))).toBe(5);
  });

  it("creates exactly one superadmin with the default email", async () => {
    await runSeed(db);
    const admins = await db.select().from(backofficeUsers).where(eq(backofficeUsers.role, "superadmin"));
    expect(admins).toHaveLength(1);
    expect(admins[0]).toMatchObject({
      email: "admin@drivebook.localhost",
      name: "Super Admin",
      status: "active",
      passwordHash: null,
    });
  });

  it("creates exactly one active demo owner across re-seeds", async () => {
    await runSeed(db);
    await runSeed(db);
    const dealer = await demoDealer();
    const owners = await db
      .select()
      .from(dealerUsers)
      .where(and(eq(dealerUsers.dealerId, dealer.id), eq(dealerUsers.role, "owner")));
    expect(owners).toHaveLength(1);
    expect(owners[0]).toMatchObject({ email: DEMO_OWNER_EMAIL, status: "active", passwordHash: null });
  });

  it("moves an owner seeded under the old email to the demo owner email", async () => {
    await runSeed(db);
    await db
      .update(dealerUsers)
      .set({ email: "lastnik@demo.drivebook.localhost" })
      .where(eq(dealerUsers.email, DEMO_OWNER_EMAIL));
    await runSeed(db);
    const dealer = await demoDealer();
    const owners = await db
      .select({ email: dealerUsers.email })
      .from(dealerUsers)
      .where(and(eq(dealerUsers.dealerId, dealer.id), eq(dealerUsers.role, "owner")));
    expect(owners).toEqual([{ email: DEMO_OWNER_EMAIL }]);
  });

  it("honours SEED_SUPERADMIN_EMAIL", async () => {
    process.env.SEED_SUPERADMIN_EMAIL = "boss@example.si";
    resetConfigForTests();
    await runSeed(db);
    await runSeed(db);
    const admins = await db.select().from(backofficeUsers).where(eq(backofficeUsers.role, "superadmin"));
    expect(admins.map((a) => a.email)).toEqual(["boss@example.si"]);
    expect(
      await rowCount(backofficeUsers, eq(backofficeUsers.email, "admin@drivebook.localhost")),
    ).toBe(0);
  });
});
