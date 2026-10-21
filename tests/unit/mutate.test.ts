// Real-database tests: start Postgres with `docker compose up -d db` (uses TEST_DATABASE_URL).
import { count, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { auditLog, cars, dealers, plans } from "@/db/schema";
import { DealerReadOnlyError } from "@/server/auth/permissions";
import type { DealerContext } from "@/server/data/context";
import { setDbForTests } from "@/server/data/db";
import { resolveDealerSlug } from "@/server/data/dealers";
import { withDealerMutation } from "@/server/data/mutate";
import { getTestDb, truncateAll } from "../setup/db";

const db = getTestDb();

async function seedDealer() {
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
  const resolved = await resolveDealerSlug("demo");
  if (resolved.kind !== "current") throw new Error("dealer not found");
  return { dealer, ctx: resolved.ctx };
}

const newCar = (dealerId: string) => ({
  dealerId,
  make: "Škoda",
  model: "Octavia",
  year: 2020,
  priceEur: 15000,
  body: "estate" as const,
  avtoNetUrl: `https://www.avto.net/Ads/details.asp?id=${dealerId}`,
});

async function counts() {
  const [c] = await db.select({ n: count() }).from(cars);
  const [a] = await db.select({ n: count() }).from(auditLog);
  return { cars: c.n, audit: a.n };
}

const insertCar = (ctx: DealerContext) =>
  withDealerMutation(
    ctx,
    async (tx) => {
      const [row] = await tx.insert(cars).values(newCar(ctx.dealerId)).returning({ id: cars.id });
      return row.id;
    },
    { action: "car.create", entity: "car", actorKind: "dealer_user", actorId: "u1", data: { make: "Škoda" } },
  );

beforeAll(() => setDbForTests(db));
beforeEach(truncateAll);
afterAll(async () => {
  setDbForTests(undefined);
  await db.$client.end();
});

describe("withDealerMutation", () => {
  it("commits the write and one audit_log row for an active dealer", async () => {
    const { dealer, ctx } = await seedDealer();
    const carId = await insertCar(ctx);

    expect(await counts()).toEqual({ cars: 1, audit: 1 });
    const [entry] = await db.select().from(auditLog);
    expect(entry).toMatchObject({
      dealerId: dealer.id,
      action: "car.create",
      entity: "car",
      actorKind: "dealer_user",
      actorId: "u1",
      data: { make: "Škoda" },
    });
    const [saved] = await db.select().from(cars).where(eq(cars.id, carId));
    expect(saved.dealerId).toBe(dealer.id);
  });

  it("writes no audit row when no audit entry is given", async () => {
    const { ctx } = await seedDealer();
    await withDealerMutation(ctx, (tx) => tx.insert(cars).values(newCar(ctx.dealerId)));
    expect(await counts()).toEqual({ cars: 1, audit: 0 });
  });

  it.each(["read_only", "suspended"] as const)(
    "throws DealerReadOnlyError and writes nothing when the dealer became %s",
    async (status) => {
      const { dealer, ctx } = await seedDealer();
      expect(ctx.status).toBe("active");
      await db.update(dealers).set({ status }).where(eq(dealers.id, dealer.id));
      const before = await counts();

      await expect(insertCar(ctx)).rejects.toBeInstanceOf(DealerReadOnlyError);
      expect(await counts()).toEqual(before);
    },
  );

  it("rolls back the write when the callback throws", async () => {
    const { ctx } = await seedDealer();
    await expect(
      withDealerMutation(
        ctx,
        async (tx) => {
          await tx.insert(cars).values(newCar(ctx.dealerId));
          throw new Error("boom");
        },
        { action: "car.create", entity: "car" },
      ),
    ).rejects.toThrow("boom");
    expect(await counts()).toEqual({ cars: 0, audit: 0 });
  });
});
