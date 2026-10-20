// Real-database tests: start Postgres with `docker compose up -d db`. They use TEST_DATABASE_URL
// (default postgres://drivebook:drivebook@localhost:5432/drivebook_test), never the dev database.
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { backofficeUsers, cars, dealerLicenceHistory, dealers, dealerUsers, plans, sessions } from "@/db/schema";
import { getTestDb, truncateAll } from "../setup/db";

const db = getTestDb();

function pgCode(error: unknown): string | undefined {
  let current: unknown = error;
  while (current instanceof Error) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string") return code;
    current = current.cause;
  }
  return undefined;
}

async function expectPgError(promise: Promise<unknown>, code: string) {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error, `expected Postgres error ${code}`).toBeDefined();
  expect(pgCode(error)).toBe(code);
}

async function insertDealer() {
  const [plan] = await db
    .insert(plans)
    .values({ code: "basic", name: "Basic", maxCars: 20, maxUsers: 5, smsIncluded: 100, priceEurCents: 4900 })
    .returning();
  const [dealer] = await db
    .insert(dealers)
    .values({
      slug: "avto-test",
      name: "Avto Test",
      legalName: "Avto Test d.o.o.",
      addressLine: "Dunajska cesta 1",
      postalCode: "1000",
      city: "Ljubljana",
      phone: "+38611234567",
      email: "info@avto-test.si",
      primaryColor: "#E4572E",
      planId: plan.id,
    })
    .returning();
  return { plan, dealer };
}

beforeEach(truncateAll);

afterAll(async () => {
  await db.$client.end();
});

describe("phase-1 schema", () => {
  it("applies migrations with btree_gist enabled", async () => {
    const result = await db.execute(sql`SELECT extname FROM pg_extension WHERE extname = 'btree_gist'`);
    expect(result.rows).toHaveLength(1);
  });

  it("stores every timestamp as timestamptz", async () => {
    const result = await db.execute(sql`
      SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND data_type = 'timestamp without time zone'`);
    expect(result.rows).toEqual([]);
  });

  it("rejects overlapping licence periods for one dealer", async () => {
    const { plan, dealer } = await insertDealer();
    await db.insert(dealerLicenceHistory).values({
      dealerId: dealer.id,
      planId: plan.id,
      validFrom: new Date("2026-01-01T00:00:00Z"),
      validTo: new Date("2026-07-01T00:00:00Z"),
      note: "first",
    });
    await expectPgError(
      db.insert(dealerLicenceHistory).values({
        dealerId: dealer.id,
        planId: plan.id,
        validFrom: new Date("2026-06-01T00:00:00Z"),
        note: "overlaps",
      }),
      "23P01",
    );
    await db.insert(dealerLicenceHistory).values({
      dealerId: dealer.id,
      planId: plan.id,
      validFrom: new Date("2026-07-01T00:00:00Z"),
      note: "adjacent",
    });
  });

  it("gives cars a non-sequential 16-character base62 id", async () => {
    const { dealer } = await insertDealer();
    const base = { dealerId: dealer.id, make: "Škoda", model: "Octavia", year: 2022, priceEur: 21900, body: "estate" as const };
    const inserted = await db
      .insert(cars)
      .values([
        { ...base, avtoNetUrl: "https://www.avto.net/Ads/details.asp?id=1" },
        { ...base, avtoNetUrl: "https://www.avto.net/Ads/details.asp?id=2" },
      ])
      .returning({ id: cars.id });
    const ids = inserted.map((car) => car.id);
    for (const id of ids) expect(id).toMatch(/^[0-9A-Za-z]{16}$/);
    expect(ids[0]).not.toBe(ids[1]);
    expect(ids.some((id) => /^\d+$/.test(id))).toBe(false);
  });

  it("rejects sessions with both or neither user id set", async () => {
    const { dealer } = await insertDealer();
    const [user] = await db
      .insert(dealerUsers)
      .values({ dealerId: dealer.id, email: "owner@avto-test.si", name: "Owner", role: "owner" })
      .returning();
    const [admin] = await db
      .insert(backofficeUsers)
      .values({ email: "admin@drivebook.si", name: "Admin", role: "superadmin" })
      .returning();
    const expiresAt = new Date("2026-12-31T00:00:00Z");

    await db.insert(sessions).values({ id: "ok", userKind: "dealer", dealerUserId: user.id, expiresAt });
    await expectPgError(
      db.insert(sessions).values({ id: "neither", userKind: "dealer", expiresAt }),
      "23514",
    );
    await expectPgError(
      db.insert(sessions).values({ id: "wrong-kind", userKind: "backoffice", dealerUserId: user.id, expiresAt }),
      "23514",
    );
    for (const userKind of ["dealer", "backoffice"] as const) {
      await expectPgError(
        db.insert(sessions).values({
          id: `both-${userKind}`,
          userKind,
          dealerUserId: user.id,
          backofficeUserId: admin.id,
          expiresAt,
        }),
        "23514",
      );
    }
  });

  it("treats dealer user emails case-insensitively per dealer", async () => {
    const { dealer } = await insertDealer();
    await db.insert(dealerUsers).values({ dealerId: dealer.id, email: "Sales@avto-test.si", name: "A", role: "salesperson" });
    await expectPgError(
      db.insert(dealerUsers).values({ dealerId: dealer.id, email: "sales@AVTO-test.si", name: "B", role: "salesperson" }),
      "23505",
    );
  });
});
