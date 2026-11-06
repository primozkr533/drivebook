// Real-database tests: start Postgres with `docker compose up -d db` (uses TEST_DATABASE_URL).
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { auditLog, bookings, cars, dealers, messageLog, openingHours, plans } from "@/db/schema";
import { zonedToUtc } from "@/lib/date";
import { getTestDb, truncateAll } from "../setup/db";

const state = vi.hoisted(() => ({ user: null as { id: string; role: "owner" | "salesperson"; dealerId: string } | null }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({
  redirect: (location: string) => {
    throw new Error(`redirect ${location}`);
  },
}));
vi.mock("@/server/auth/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/auth/session")>();
  const { createDealerContext } = await import("@/server/data/context");
  return {
    ...actual,
    getDealerContextFromSession: async () => {
      const u = state.user;
      if (!u) return null;
      return {
        ctx: createDealerContext({ id: u.dealerId, slug: "s", status: "active" }),
        user: { id: u.id, email: "u@x.si", role: u.role },
        sessionId: "s",
      };
    },
  };
});

const { DealerReadOnlyError } = await import("@/server/auth/permissions");
const { setDbForTests } = await import("@/server/data/db");
const { resolveDealerSlug } = await import("@/server/data/dealers");
const { addCar, deleteCar, listCarsForAdmin, setCarActive, setListingFetcherForTests, updateCar } = await import("@/server/data/cars");
const { cancelBooking, createBooking, getCarAvailability, getPublicBooking, listBookings } = await import("@/server/data/bookings");
const { stopBossForTests } = await import("@/server/notify/queue");

const db = getTestDb();

// Monday 9 Nov 2026, 08:00 in Ljubljana. Default rules: 45 min test drive, 15 min step, 120 min notice, 15 min buffer.
const NOW = zonedToUtc("2026-11-09", "08:00");
const TUESDAY = "2026-11-10";

const LISTING_HTML = `<html><head><meta property="og:image" content="https://images.avto.net/1.jpg"></head>
<body><h1>Škoda Octavia Combi 2.0 TDI</h1><p>Prva registracija: 2021</p><p>Prevoženih km: 87.400 km</p><p>Cena: 18.900 €</p></body></html>`;

async function seedDealer(slug: string) {
  const [plan] = await db
    .insert(plans)
    .values({ code: `plan-${slug}`, name: `Basic ${slug}`, maxCars: 20, maxUsers: 5, monthlySmsQuota: 100, priceEurCents: 4900 })
    .returning();
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
      planId: plan.id,
    })
    .returning();
  await db.insert(openingHours).values(
    [1, 2, 3, 4, 5].map((d) => ({ dealerId: dealer.id, isoWeekday: d, opensAt: "08:00", closesAt: "16:00" })),
  );
  const resolved = await resolveDealerSlug(slug);
  if (resolved.kind !== "current") throw new Error("dealer not found");
  return { dealer, ctx: resolved.ctx };
}

function signIn(dealerId: string, role: "owner" | "salesperson" = "owner") {
  state.user = { id: `u-${role}-${dealerId}`, role, dealerId };
}

const url = (id: number) => `https://www.avto.net/Ads/details.asp?id=${id}`;

async function insertCar(dealerId: string, id: number) {
  const [car] = await db
    .insert(cars)
    .values({ dealerId, make: "Škoda", model: `Octavia ${id}`, avtoNetUrl: url(id) })
    .returning();
  return car;
}

const customer = { name: "Ana Novak", phone: "041 123 456", email: "ana@example.si" };

beforeAll(() => setDbForTests(db));
beforeEach(async () => {
  await truncateAll();
  state.user = null;
  setListingFetcherForTests(async () => null);
});
afterAll(async () => {
  setListingFetcherForTests(undefined);
  setDbForTests(undefined);
  await stopBossForTests();
  await db.$client.end();
});

describe("cars", () => {
  it("adds a car from the avto.net listing with the dealer's note", async () => {
    const { ctx } = await seedDealer("demo");
    signIn(ctx.dealerId, "salesperson");
    setListingFetcherForTests(async () => LISTING_HTML);
    const result = await addCar(ctx, { avtoNetUrl: `${url(77)}&display=x`, notes: "Na lokaciji Ljubljana" }, NOW);
    expect(result).toMatchObject({
      ok: true,
      fromListing: true,
      car: { make: "Škoda", model: "Octavia Combi 2.0 TDI", year: 2021, mileageKm: 87400, priceEur: 18900, notes: "Na lokaciji Ljubljana", avtoNetUrl: url(77) },
    });
    const [audit] = await db.select().from(auditLog).where(eq(auditLog.action, "car.add"));
    expect(audit.dealerId).toBe(ctx.dealerId);
  });

  it("asks for details by hand when the listing can't be read, then accepts them", async () => {
    const { ctx } = await seedDealer("demo");
    signIn(ctx.dealerId);
    expect(await addCar(ctx, { avtoNetUrl: url(5) }, NOW)).toEqual({ ok: false, errors: {}, needsDetails: true });
    expect(await addCar(ctx, { avtoNetUrl: url(5), make: "Renault" }, NOW)).toEqual({
      ok: false,
      errors: { model: "required" },
      needsDetails: true,
    });
    const result = await addCar(ctx, { avtoNetUrl: url(5), make: "Renault", model: "Clio", year: "2023", mileageKm: "18.900" }, NOW);
    expect(result).toMatchObject({ ok: true, fromListing: false, car: { make: "Renault", model: "Clio", year: 2023, mileageKm: 18900 } });
  });

  it("validates the link, numbers and duplicates", async () => {
    const { ctx } = await seedDealer("demo");
    signIn(ctx.dealerId);
    expect(await addCar(ctx, { avtoNetUrl: "https://example.com/x" }, NOW)).toMatchObject({ ok: false, errors: { avtoNetUrl: "invalid" } });
    expect(await addCar(ctx, { avtoNetUrl: url(1), make: "A", model: "B", year: "1800" }, NOW)).toMatchObject({
      ok: false,
      errors: { year: "out_of_range" },
    });
    await insertCar(ctx.dealerId, 1);
    expect(await addCar(ctx, { avtoNetUrl: url(1), make: "A", model: "B" }, NOW)).toMatchObject({ ok: false, errors: { avtoNetUrl: "taken" } });
  });

  it("returns not-found for another dealer's car and refuses deleting a booked car", async () => {
    const { ctx } = await seedDealer("demo");
    const { ctx: other } = await seedDealer("other");
    const foreign = await insertCar(other.dealerId, 9);
    const own = await insertCar(ctx.dealerId, 1);
    signIn(ctx.dealerId);
    expect(await setCarActive(ctx, foreign.id, false)).toEqual({ ok: false, notFound: true });
    expect(await deleteCar(ctx, foreign.id)).toEqual({ ok: false, notFound: true });
    expect(await updateCar(ctx, foreign.id, { make: "X", model: "Y" }, NOW)).toEqual({ ok: false, notFound: true });

    const slot = (await getCarAvailability(ctx, own.id, "test_drive", NOW))!.days.find((d) => d.date === TUESDAY)!.slots[0];
    expect(await createBooking(ctx, { carId: own.id, kind: "test_drive", start: slot.start.toISOString(), ...customer }, NOW)).toMatchObject({ ok: true });
    expect(await deleteCar(ctx, own.id)).toEqual({ ok: false, hasBookings: true });
    expect((await listCarsForAdmin(ctx))[0]).toMatchObject({ id: own.id, bookingCount: 1 });
  });
});

describe("bookings", () => {
  it("gives every car its own calendar inside the shared opening hours", async () => {
    const { ctx } = await seedDealer("demo");
    const a = await insertCar(ctx.dealerId, 1);
    const b = await insertCar(ctx.dealerId, 2);

    const availability = (await getCarAvailability(ctx, a.id, "test_drive", NOW))!;
    expect(availability.durationMinutes).toBe(45);
    const monday = availability.days.find((d) => d.date === "2026-11-09")!;
    expect(monday.slots[0].label).toBe("10:00"); // 120 min notice
    const saturday = availability.days.find((d) => d.date === "2026-11-14")!;
    expect(saturday.slots).toEqual([]);

    const start = zonedToUtc(TUESDAY, "10:00").toISOString();
    const first = await createBooking(ctx, { carId: a.id, kind: "test_drive", start, ...customer }, NOW);
    expect(first.ok).toBe(true);

    // Same car, same time → taken; the other car is still free then.
    expect(await createBooking(ctx, { carId: a.id, kind: "viewing", start, ...customer }, NOW)).toEqual({
      ok: false,
      errors: { start: "slot_taken" },
    });
    expect(await createBooking(ctx, { carId: b.id, kind: "test_drive", start, ...customer }, NOW)).toMatchObject({ ok: true });

    const labelsA = (await getCarAvailability(ctx, a.id, "test_drive", NOW))!.days.find((d) => d.date === TUESDAY)!.slots.map((s) => s.label);
    expect(labelsA).not.toContain("10:00");
    expect(labelsA).not.toContain("09:30"); // would end 10:15, inside the buffer
    expect(labelsA).toContain("09:00");
    expect(labelsA).toContain("11:00");
  });

  it("validates customer data and normalises the phone", async () => {
    const { ctx } = await seedDealer("demo");
    const car = await insertCar(ctx.dealerId, 1);
    const start = zonedToUtc(TUESDAY, "10:00").toISOString();
    expect(await createBooking(ctx, { carId: car.id, kind: "test_drive", start, name: "", phone: "12", email: "x" }, NOW)).toEqual({
      ok: false,
      errors: { name: "required", phone: "invalid", email: "invalid" },
    });
    // Off-grid and out-of-hours starts are not bookable.
    expect(
      await createBooking(ctx, { carId: car.id, kind: "test_drive", start: zonedToUtc(TUESDAY, "10:07").toISOString(), ...customer }, NOW),
    ).toEqual({ ok: false, errors: { start: "slot_taken" } });
    expect(
      await createBooking(ctx, { carId: car.id, kind: "test_drive", start: zonedToUtc(TUESDAY, "15:30").toISOString(), ...customer }, NOW),
    ).toEqual({ ok: false, errors: { start: "slot_taken" } });

    const ok = await createBooking(ctx, { carId: car.id, kind: "test_drive", start, ...customer }, NOW);
    if (!ok.ok) throw new Error("expected booking");
    const booking = await getPublicBooking(ctx, ok.bookingId);
    expect(booking).toMatchObject({ customerPhone: "+38641123456", status: "confirmed", car: { id: car.id } });
    expect(booking!.code).toMatch(/^[A-Z2-9]{6}$/);
    const sms = await db.select().from(messageLog).where(eq(messageLog.channel, "sms"));
    expect(sms.map((m) => m.recipient)).toContain("+38641123456");
  });

  it("refuses hidden cars, other dealers' cars and read-only dealers", async () => {
    const { ctx } = await seedDealer("demo");
    const { ctx: other } = await seedDealer("other");
    const foreign = await insertCar(other.dealerId, 9);
    const hidden = await insertCar(ctx.dealerId, 1);
    await db.update(cars).set({ active: false }).where(eq(cars.id, hidden.id));
    const start = zonedToUtc(TUESDAY, "10:00").toISOString();
    expect(await getCarAvailability(ctx, foreign.id, "test_drive", NOW)).toBeNull();
    expect(await createBooking(ctx, { carId: foreign.id, kind: "test_drive", start, ...customer }, NOW)).toEqual({ ok: false, carNotFound: true });
    expect(await createBooking(ctx, { carId: hidden.id, kind: "test_drive", start, ...customer }, NOW)).toEqual({ ok: false, carNotFound: true });

    const car = await insertCar(ctx.dealerId, 2);
    await db.update(dealers).set({ status: "read_only" }).where(eq(dealers.id, ctx.dealerId));
    await expect(createBooking(ctx, { carId: car.id, kind: "test_drive", start, ...customer }, NOW)).rejects.toBeInstanceOf(DealerReadOnlyError);
  });

  it("lists bookings for the dealer and frees the slot when one is cancelled", async () => {
    const { ctx } = await seedDealer("demo");
    const { ctx: other } = await seedDealer("other");
    const car = await insertCar(ctx.dealerId, 1);
    const start = zonedToUtc(TUESDAY, "10:00").toISOString();
    const created = await createBooking(ctx, { carId: car.id, kind: "test_drive", start, ...customer }, NOW);
    if (!created.ok) throw new Error("expected booking");

    signIn(other.dealerId);
    expect(await cancelBooking(other, created.bookingId)).toEqual({ ok: false, notFound: true });

    signIn(ctx.dealerId, "salesperson");
    const list = await listBookings(ctx, { fromDate: "2026-11-09" });
    expect(list.map((b) => b.id)).toEqual([created.bookingId]);
    expect(await cancelBooking(ctx, created.bookingId)).toEqual({ ok: true });
    expect(await cancelBooking(ctx, created.bookingId)).toEqual({ ok: false, alreadyCancelled: true });
    const [row] = await db.select().from(bookings).where(eq(bookings.id, created.bookingId));
    expect(row.status).toBe("cancelled");
    expect(await createBooking(ctx, { carId: car.id, kind: "test_drive", start, ...customer }, NOW)).toMatchObject({ ok: true });
  });
});
