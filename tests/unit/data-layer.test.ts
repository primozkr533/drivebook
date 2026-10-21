// Real-database tests: start Postgres with `docker compose up -d db` (uses TEST_DATABASE_URL).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { cars, dealers, dealerSlugHistory, openingHours, plans } from "@/db/schema";
import { listActiveCars, getCar } from "@/server/data/cars";
import type { DealerContext } from "@/server/data/context";
import { setDbForTests } from "@/server/data/db";
import { resolveDealerSlug } from "@/server/data/dealers";
import { listOpeningHours } from "@/server/data/hours";
import { getTestDb, truncateAll } from "../setup/db";

const db = getTestDb();

async function seedDealers() {
  const [plan] = await db
    .insert(plans)
    .values({ code: "basic", name: "Basic", maxCars: 20, maxUsers: 5, monthlySmsQuota: 100, priceEurCents: 4900 })
    .returning();
  const dealer = (slug: string, name: string) => ({
    slug,
    name,
    legalName: `${name} d.o.o.`,
    addressLine: "Dunajska cesta 1",
    postalCode: "1000",
    city: "Ljubljana",
    phone: "+38611234567",
    email: `info@${slug}.si`,
    primaryColor: "#E4572E",
    planId: plan.id,
  });
  const [a, b] = await db
    .insert(dealers)
    .values([dealer("demo", "Demo"), dealer("drugi", "Drugi")])
    .returning();
  await db.insert(dealerSlugHistory).values({ dealerId: a.id, slug: "avtohisa-demo" });
  return { a, b };
}

async function ctxFor(slug: string): Promise<DealerContext> {
  const resolved = await resolveDealerSlug(slug);
  if (resolved.kind !== "current") throw new Error(`dealer ${slug} not found`);
  return resolved.ctx;
}

const car = (dealerId: string, n: number, extra: Partial<typeof cars.$inferInsert> = {}) => ({
  dealerId,
  make: "Škoda",
  model: `Octavia ${n}`,
  year: 2020,
  priceEur: 15000 + n,
  body: "estate" as const,
  avtoNetUrl: `https://www.avto.net/Ads/details.asp?id=${dealerId}-${n}`,
  ...extra,
});

beforeAll(() => setDbForTests(db));
beforeEach(truncateAll);
afterAll(async () => {
  setDbForTests(undefined);
  await db.$client.end();
});

describe("DealerContext", () => {
  it("cannot be built as an object literal", () => {
    // @ts-expect-error the brand symbol is private to src/server/data/context.ts
    const c: DealerContext = { dealerId: "x", slug: "y", status: "active" };
    expect(c.dealerId).toBe("x");
  });
});

describe("resolveDealerSlug", () => {
  beforeEach(seedDealers);

  it("resolves the current slug, case-insensitively", async () => {
    const resolved = await resolveDealerSlug("DEMO");
    expect(resolved.kind).toBe("current");
    if (resolved.kind !== "current") return;
    expect(resolved.ctx).toMatchObject({ slug: "demo", status: "active" });
    expect(resolved.dealer).toMatchObject({ name: "Demo", logoUrl: null, websiteUrl: null, status: "active" });
  });

  it("redirects an old slug to the current one", async () => {
    expect(await resolveDealerSlug("avtohisa-demo")).toEqual({ kind: "renamed", slug: "demo" });
  });

  it("returns unknown for a missing slug", async () => {
    expect(await resolveDealerSlug("nope")).toEqual({ kind: "unknown" });
  });

  it("returns unknown for a reserved slug without touching the database", async () => {
    const untouchable = new Proxy({} as Db, {
      get() {
        throw new Error("database was queried");
      },
    });
    setDbForTests(untouchable);
    try {
      expect(await resolveDealerSlug("admin")).toEqual({ kind: "unknown" });
      expect(await resolveDealerSlug("Admin")).toEqual({ kind: "unknown" });
    } finally {
      setDbForTests(db);
    }
  });
});

describe("tenant isolation", () => {
  it("lists only the context dealer's active cars, in sort order", async () => {
    const { a, b } = await seedDealers();
    await db.insert(cars).values([
      car(a.id, 1, { sortOrder: 2 }),
      car(a.id, 2, { sortOrder: 1, trim: "RS" }),
      car(a.id, 3, { active: false }),
      car(b.id, 4),
    ]);

    const list = await listActiveCars(await ctxFor("demo"));
    expect(list.map((c) => c.model)).toEqual(["Octavia 2", "Octavia 1"]);
    expect(list[0]).toMatchObject({ trim: "RS", imageUrl: undefined, body: "estate", active: true });
    expect(list[1].trim).toBeUndefined();
  });

  it("never returns another dealer's car", async () => {
    const { a, b } = await seedDealers();
    const [own] = await db.insert(cars).values(car(a.id, 1)).returning();
    const [foreign] = await db.insert(cars).values(car(b.id, 2)).returning();
    const ctxA = await ctxFor("demo");

    expect(await getCar(ctxA, own.id)).toMatchObject({ id: own.id, model: "Octavia 1" });
    expect(await getCar(ctxA, foreign.id)).toBeNull();
  });

  it("lists only the context dealer's opening hours as HH:MM", async () => {
    const { a, b } = await seedDealers();
    await db.insert(openingHours).values([
      { dealerId: a.id, isoWeekday: 2, opensAt: "08:00", closesAt: "17:30" },
      { dealerId: a.id, isoWeekday: 1, opensAt: "08:00", closesAt: "16:00" },
      { dealerId: b.id, isoWeekday: 1, opensAt: "09:00", closesAt: "12:00" },
    ]);

    expect(await listOpeningHours(await ctxFor("demo"))).toEqual([
      { isoWeekday: 1, opensAt: "08:00", closesAt: "16:00" },
      { isoWeekday: 2, opensAt: "08:00", closesAt: "17:30" },
    ]);
  });
});
