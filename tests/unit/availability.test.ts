// Real-database tests: start Postgres with `docker compose up -d db` (uses TEST_DATABASE_URL).
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { dealerClosures, dealers, holidayOverrides, openingHours, plans } from "@/db/schema";
import { slovenianWorkFreeDays } from "@/lib/date";
import {
  getClosedDatesBetween,
  getOpeningRangesForDate,
  isDealerClosed,
} from "@/server/data/availability";
import type { DealerContext } from "@/server/data/context";
import { setDbForTests } from "@/server/data/db";
import { resolveDealerSlug } from "@/server/data/dealers";
import { getTestDb, truncateAll } from "../setup/db";

const db = getTestDb();

let a: { id: string };
let b: { id: string };
let ctxA: DealerContext;
let ctxB: DealerContext;

async function ctxFor(slug: string): Promise<DealerContext> {
  const resolved = await resolveDealerSlug(slug);
  if (resolved.kind !== "current") throw new Error(`dealer ${slug} not found`);
  return resolved.ctx;
}

// Mirrors createDealer: one row per computed work-free day of the year.
async function seedHolidayRows(dealerId: string, year: number, openAnyway: string[] = []) {
  await db.insert(holidayOverrides).values(
    slovenianWorkFreeDays(year).map((d) => ({
      dealerId,
      date: d.date,
      key: d.key,
      name: d.key,
      openAnyway: openAnyway.includes(d.date),
    })),
  );
}

beforeAll(() => setDbForTests(db));
beforeEach(async () => {
  await truncateAll();
  const [plan] = await db
    .insert(plans)
    .values({ code: "basic", name: "Basic", maxCars: 20, maxUsers: 5, monthlySmsQuota: 100, priceEurCents: 4900 })
    .returning();
  const dealer = (slug: string) => ({
    slug,
    name: slug,
    legalName: slug,
    addressLine: "Dunajska cesta 1",
    postalCode: "1000",
    city: "Ljubljana",
    phone: "+38611234567",
    email: `info@${slug}.si`,
    primaryColor: "#E4572E",
    planId: plan.id,
  });
  [a, b] = await db.insert(dealers).values([dealer("demo"), dealer("drugi")]).returning();
  ctxA = await ctxFor("demo");
  ctxB = await ctxFor("drugi");
});
afterAll(async () => {
  setDbForTests(undefined);
  await db.$client.end();
});

describe("isDealerClosed", () => {
  it("closes a holiday unless that year's row is open_anyway; the next year stays closed", async () => {
    await seedHolidayRows(a.id, 2026);
    await seedHolidayRows(a.id, 2027);
    expect(await isDealerClosed(ctxA, "2026-12-25")).toEqual({ closed: true, reason: "holiday", holidayKey: "christmas" });

    await db
      .update(holidayOverrides)
      .set({ openAnyway: true })
      .where(and(eq(holidayOverrides.dealerId, a.id), eq(holidayOverrides.date, "2026-12-25")));

    expect(await isDealerClosed(ctxA, "2026-12-25")).toEqual({ closed: false, reason: null });
    expect(await isDealerClosed(ctxA, "2026-12-26")).toEqual({
      closed: true,
      reason: "holiday",
      holidayKey: "independence",
    });
    expect(await isDealerClosed(ctxA, "2027-12-25")).toEqual({ closed: true, reason: "holiday", holidayKey: "christmas" });
  });

  it("falls back to slovenianWorkFreeDays for a year without holiday rows", async () => {
    await seedHolidayRows(a.id, 2026, ["2026-04-06"]);
    // Easter Monday 2027 is 29 March, the day after the DST change.
    expect(await isDealerClosed(ctxA, "2027-03-29")).toEqual({
      closed: true,
      reason: "holiday",
      holidayKey: "easterMonday",
    });
    expect(await isDealerClosed(ctxA, "2026-04-06")).toEqual({ closed: false, reason: null });
    expect(await isDealerClosed(ctxB, "2026-04-06")).toEqual({
      closed: true,
      reason: "holiday",
      holidayKey: "easterMonday",
    });
    expect(await isDealerClosed(ctxA, "2027-03-30")).toEqual({ closed: false, reason: null });
  });

  it("closes a dealer-defined holiday row without a key", async () => {
    await seedHolidayRows(a.id, 2026);
    await db.insert(holidayOverrides).values({ dealerId: a.id, date: "2026-08-14", key: null, name: "Dopust" });
    expect(await isDealerClosed(ctxA, "2026-08-14")).toEqual({ closed: true, reason: "holiday" });
  });

  it("closes the first, middle and last day of a custom closure, but not the day after", async () => {
    await db.insert(dealerClosures).values({ dealerId: a.id, startDate: "2026-10-23", endDate: "2026-10-27", reason: "Inventura" });
    for (const date of ["2026-10-23", "2026-10-25", "2026-10-27"]) {
      expect(await isDealerClosed(ctxA, date)).toEqual({ closed: true, reason: "closure", closureReason: "Inventura" });
    }
    expect(await isDealerClosed(ctxA, "2026-10-22")).toEqual({ closed: false, reason: null });
    expect(await isDealerClosed(ctxA, "2026-10-28")).toEqual({ closed: false, reason: null });
  });

  it("reports a null closure reason and closes an open-anyway holiday inside a closure", async () => {
    await seedHolidayRows(a.id, 2026, ["2026-12-25", "2026-12-26"]);
    await db.insert(dealerClosures).values({ dealerId: a.id, startDate: "2026-12-24", endDate: "2026-12-31" });
    expect(await isDealerClosed(ctxA, "2026-12-25")).toEqual({ closed: true, reason: "closure", closureReason: null });
  });

  it("never applies dealer B's closures or open-anyway rows to dealer A", async () => {
    await seedHolidayRows(a.id, 2026);
    await seedHolidayRows(b.id, 2026, ["2026-12-25"]);
    await db.insert(dealerClosures).values({ dealerId: b.id, startDate: "2026-11-02", endDate: "2026-11-06", reason: "B" });

    expect(await isDealerClosed(ctxA, "2026-11-04")).toEqual({ closed: false, reason: null });
    expect(await isDealerClosed(ctxA, "2026-12-25")).toMatchObject({ closed: true, reason: "holiday" });
    expect(await isDealerClosed(ctxB, "2026-11-04")).toMatchObject({ closed: true, reason: "closure" });
    expect(await isDealerClosed(ctxB, "2026-12-25")).toMatchObject({ closed: false });
    expect(await getClosedDatesBetween(ctxA, "2026-11-01", "2026-11-30")).toEqual([
      { date: "2026-11-01", reason: "holiday", holidayKey: "remembrance" },
    ]);
  });

  it("rejects a malformed date", async () => {
    await expect(isDealerClosed(ctxA, "2026-02-30")).rejects.toThrow("Invalid date");
  });
});

describe("getOpeningRangesForDate", () => {
  beforeEach(async () => {
    await seedHolidayRows(a.id, 2026, ["2026-11-01"]);
    await db.insert(openingHours).values([
      { dealerId: a.id, isoWeekday: 4, opensAt: "13:00", closesAt: "17:00" },
      { dealerId: a.id, isoWeekday: 4, opensAt: "08:00", closesAt: "12:00" },
      { dealerId: a.id, isoWeekday: 5, opensAt: "08:00", closesAt: "16:00" },
      { dealerId: a.id, isoWeekday: 7, opensAt: "10:00", closesAt: "12:00" },
      { dealerId: b.id, isoWeekday: 6, opensAt: "09:00", closesAt: "12:00" },
    ]);
  });

  it("returns the weekday's ranges in order on an open day", async () => {
    expect(await getOpeningRangesForDate(ctxA, "2026-10-22")).toEqual([
      { opens: "08:00", closes: "12:00" },
      { opens: "13:00", closes: "17:00" },
    ]);
    // Sunday of the autumn DST change.
    expect(await getOpeningRangesForDate(ctxA, "2026-10-25")).toEqual([{ opens: "10:00", closes: "12:00" }]);
  });

  it("returns [] on a weekday without ranges, also when another dealer has some", async () => {
    expect(await getOpeningRangesForDate(ctxA, "2026-10-24")).toEqual([]);
    expect(await getOpeningRangesForDate(ctxA, "2026-10-19")).toEqual([]);
  });

  it("returns [] on a holiday and inside a closure", async () => {
    expect(await getOpeningRangesForDate(ctxA, "2026-12-25")).toEqual([]);
    await db.insert(dealerClosures).values({ dealerId: a.id, startDate: "2026-10-29", endDate: "2026-10-30" });
    expect(await getOpeningRangesForDate(ctxA, "2026-10-29")).toEqual([]);
    expect(await getOpeningRangesForDate(ctxA, "2026-10-30")).toEqual([]);
  });

  it("uses the weekday's ranges on an open-anyway holiday, or the row's own hours when set", async () => {
    expect(await getOpeningRangesForDate(ctxA, "2026-11-01")).toEqual([{ opens: "10:00", closes: "12:00" }]);
    await db.insert(holidayOverrides).values({
      dealerId: a.id,
      date: "2026-08-14",
      name: "Poletni dan",
      openAnyway: true,
      opensAt: "09:00",
      closesAt: "11:30",
    });
    expect(await getOpeningRangesForDate(ctxA, "2026-08-14")).toEqual([{ opens: "09:00", closes: "11:30" }]);
  });
});

describe("getClosedDatesBetween", () => {
  it("lists holidays and closures in date order with their reasons, omitting open-anyway holidays", async () => {
    await seedHolidayRows(a.id, 2026, ["2026-12-26"]);
    await db.insert(dealerClosures).values([
      { dealerId: a.id, startDate: "2026-12-30", endDate: "2027-01-03", reason: "Zimski dopust" },
      { dealerId: a.id, startDate: "2026-12-10", endDate: "2026-12-10", reason: null },
    ]);

    expect(await getClosedDatesBetween(ctxA, "2026-12-01", "2027-01-05")).toEqual([
      { date: "2026-12-10", reason: "closure", closureReason: null },
      { date: "2026-12-25", reason: "holiday", holidayKey: "christmas" },
      { date: "2026-12-30", reason: "closure", closureReason: "Zimski dopust" },
      { date: "2026-12-31", reason: "closure", closureReason: "Zimski dopust" },
      // 2027 has no rows: the computed New Year days win over the closure.
      { date: "2027-01-01", reason: "holiday", holidayKey: "newYear1" },
      { date: "2027-01-02", reason: "holiday", holidayKey: "newYear2" },
      { date: "2027-01-03", reason: "closure", closureReason: "Zimski dopust" },
    ]);
  });

  it("clips closures to the range and includes both ends", async () => {
    await db.insert(dealerClosures).values({ dealerId: a.id, startDate: "2026-10-20", endDate: "2026-10-30", reason: "x" });
    const dates = await getClosedDatesBetween(ctxA, "2026-10-28", "2026-11-01");
    expect(dates.map((d) => d.date)).toEqual(["2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01"]);
    expect(dates.map((d) => d.reason)).toEqual(["closure", "closure", "closure", "holiday", "holiday"]);
  });

  it("walks whole days across both DST changes", async () => {
    await db.insert(dealerClosures).values([
      { dealerId: a.id, startDate: "2026-03-28", endDate: "2026-03-30" },
      { dealerId: a.id, startDate: "2026-10-24", endDate: "2026-10-26" },
    ]);
    const spring = await getClosedDatesBetween(ctxA, "2026-03-27", "2026-03-31");
    expect(spring.map((d) => d.date)).toEqual(["2026-03-28", "2026-03-29", "2026-03-30"]);
    const autumn = await getClosedDatesBetween(ctxA, "2026-10-23", "2026-10-27");
    expect(autumn.map((d) => d.date)).toEqual(["2026-10-24", "2026-10-25", "2026-10-26"]);
  });

  it("accepts up to 366 days and rejects longer or reversed ranges", async () => {
    const leap = await getClosedDatesBetween(ctxA, "2028-01-01", "2028-12-31");
    expect(leap.map((d) => d.date)).toEqual(slovenianWorkFreeDays(2028).map((d) => d.date));
    await expect(getClosedDatesBetween(ctxA, "2026-01-01", "2027-01-02")).rejects.toThrow("366");
    await expect(getClosedDatesBetween(ctxA, "2026-01-02", "2026-01-01")).rejects.toThrow("Invalid range");
  });
});
