// Real-database tests: start Postgres with `docker compose up -d db` (uses TEST_DATABASE_URL).
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { auditLog, dealerClosures, dealers, holidayOverrides, openingHours, plans } from "@/db/schema";
import { addDays, ljubljanaNow, slovenianWorkFreeDays } from "@/lib/date";
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

const { DealerReadOnlyError, ForbiddenError } = await import("@/server/auth/permissions");
const { setDbForTests } = await import("@/server/data/db");
const { resolveDealerSlug } = await import("@/server/data/dealers");
const {
  addClosure,
  deleteClosure,
  getOpeningHours,
  listClosures,
  listHolidays,
  replaceOpeningHours,
  setHolidayOpenAnyway,
} = await import("@/server/data/settings-hours");

const db = getTestDb();

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
  const resolved = await resolveDealerSlug(slug);
  if (resolved.kind !== "current") throw new Error("dealer not found");
  return { dealer, ctx: resolved.ctx };
}

function signIn(dealerId: string, role: "owner" | "salesperson" = "owner") {
  state.user = { id: `u-${role}-${dealerId}`, role, dealerId };
}

const audits = () => db.select().from(auditLog);
const hoursRows = (dealerId: string) => db.select().from(openingHours).where(eq(openingHours.dealerId, dealerId));
const today = () => ljubljanaNow().dateISO;
const thisYear = () => Number(today().slice(0, 4));

const week = {
  1: [
    { opens: "08:00", closes: "12:00" },
    { opens: "12:00", closes: "16:00" },
  ],
  2: [{ opens: "09:00", closes: "17:00" }],
  6: [{ opens: "09:00", closes: "12:00" }],
};

beforeAll(() => setDbForTests(db));
beforeEach(async () => {
  await truncateAll();
  state.user = null;
});
afterAll(async () => {
  setDbForTests(undefined);
  await db.$client.end();
});

describe("opening hours", () => {
  it("returns all seven days, empty when closed, sorted by start", async () => {
    const { ctx } = await seedDealer("demo");
    signIn(ctx.dealerId);
    await db.insert(openingHours).values([
      { dealerId: ctx.dealerId, isoWeekday: 1, opensAt: "13:00", closesAt: "17:00" },
      { dealerId: ctx.dealerId, isoWeekday: 1, opensAt: "08:00", closesAt: "12:00" },
    ]);
    expect(await getOpeningHours(ctx)).toEqual({
      1: [
        { opens: "08:00", closes: "12:00" },
        { opens: "13:00", closes: "17:00" },
      ],
      2: [],
      3: [],
      4: [],
      5: [],
      6: [],
      7: [],
    });
  });

  it("replaces the whole week atomically and audits it", async () => {
    const { ctx } = await seedDealer("demo");
    signIn(ctx.dealerId);
    await db.insert(openingHours).values({ dealerId: ctx.dealerId, isoWeekday: 3, opensAt: "07:00", closesAt: "19:00" });

    const result = await replaceOpeningHours(ctx, week);
    expect(result.ok).toBe(true);
    const saved = await getOpeningHours(ctx);
    expect(saved[1]).toEqual(week[1]);
    expect(saved[2]).toEqual(week[2]);
    expect(saved[3]).toEqual([]);
    expect(saved[7]).toEqual([]);
    expect(await hoursRows(ctx.dealerId)).toHaveLength(4);

    const [audit] = await audits();
    expect(audit).toMatchObject({ dealerId: ctx.dealerId, action: "opening_hours.replace", actorKind: "dealer_user" });
    expect((audit.data as { before: Record<number, unknown> }).before[3]).toEqual([{ opens: "07:00", closes: "19:00" }]);
  });

  it("accepts a fully closed week and a 00:00–24:00 day", async () => {
    const { ctx } = await seedDealer("demo");
    signIn(ctx.dealerId);
    expect((await replaceOpeningHours(ctx, { 7: [{ opens: "00:00", closes: "24:00" }] })).ok).toBe(true);
    expect((await getOpeningHours(ctx))[7]).toEqual([{ opens: "00:00", closes: "24:00" }]);
    expect((await replaceOpeningHours(ctx, {})).ok).toBe(true);
    expect(await hoursRows(ctx.dealerId)).toHaveLength(0);
  });

  it("rejects invalid ranges with day/index errors and keeps the old week", async () => {
    const { ctx } = await seedDealer("demo");
    signIn(ctx.dealerId);
    await replaceOpeningHours(ctx, week);
    const result = await replaceOpeningHours(ctx, {
      1: [
        { opens: "08:00", closes: "12:00" },
        { opens: "11:00", closes: "13:00" },
      ],
      2: [{ opens: "16:00", closes: "09:00" }],
      3: [
        { opens: "08:10", closes: "12:00" },
        { opens: "8:00", closes: "12:00" },
        { opens: "12:00", closes: "24:15" },
        { opens: "25:00", closes: "26:00" },
      ],
      4: [
        { opens: "06:00", closes: "07:00" },
        { opens: "08:00", closes: "09:00" },
        { opens: "10:00", closes: "11:00" },
        { opens: "12:00", closes: "13:00" },
        { opens: "14:00", closes: "15:00" },
      ],
      5: [{ opens: "10:00", closes: "10:00" }],
    });
    expect(result).toEqual({
      ok: false,
      errors: [
        { day: 1, index: 1, error: "overlap" },
        { day: 2, index: 0, error: "end_before_start" },
        { day: 3, index: 0, error: "invalid_time" },
        { day: 3, index: 1, error: "invalid_time" },
        { day: 3, index: 2, error: "invalid_time" },
        { day: 3, index: 3, error: "invalid_time" },
        { day: 4, index: 4, error: "too_many" },
        { day: 5, index: 0, error: "end_before_start" },
      ],
    });
    expect((await getOpeningHours(ctx))[1]).toEqual(week[1]);
    expect(await audits()).toHaveLength(1);
  });

  it("detects overlap regardless of input order", async () => {
    const { ctx } = await seedDealer("demo");
    signIn(ctx.dealerId);
    const result = await replaceOpeningHours(ctx, {
      2: [
        { opens: "13:00", closes: "17:00" },
        { opens: "09:00", closes: "18:00" },
      ],
    });
    expect(result).toEqual({ ok: false, errors: [{ day: 2, index: 0, error: "overlap" }] });
  });

  it("only touches the context dealer's rows", async () => {
    const { ctx: a } = await seedDealer("a");
    const { ctx: b } = await seedDealer("b");
    await db.insert(openingHours).values({ dealerId: b.dealerId, isoWeekday: 1, opensAt: "08:00", closesAt: "12:00" });
    signIn(a.dealerId);
    await replaceOpeningHours(a, week);
    expect(await hoursRows(b.dealerId)).toHaveLength(1);
  });
});

describe("holidays", () => {
  it("lazily seeds current and next year exactly once", async () => {
    const { ctx } = await seedDealer("demo");
    signIn(ctx.dealerId);
    const year = thisYear();
    const expected = slovenianWorkFreeDays(year).length + slovenianWorkFreeDays(year + 1).length;

    const first = await listHolidays(ctx);
    expect(first).toHaveLength(expected);
    expect(first[0]).toMatchObject({ date: `${year}-01-01`, key: "newYear1", year, openAnyway: false });
    expect(first.map((h) => h.date)).toEqual([...first.map((h) => h.date)].sort());

    const second = await listHolidays(ctx);
    expect(second).toEqual(first);
    expect(await db.select().from(holidayOverrides)).toHaveLength(expected);
    expect((await audits()).filter((a) => a.action === "holidays.seed")).toHaveLength(1);
  });

  it("seeds only the missing year and ignores older years", async () => {
    const { ctx } = await seedDealer("demo");
    signIn(ctx.dealerId);
    const year = thisYear();
    await db.insert(holidayOverrides).values([
      { dealerId: ctx.dealerId, date: `${year - 1}-12-25`, key: "christmas", name: "Božič" },
      { dealerId: ctx.dealerId, date: `${year}-12-25`, key: "christmas", name: "Božič", openAnyway: true },
    ]);
    const rows = await listHolidays(ctx);
    expect(rows.filter((r) => r.year === year)).toEqual([expect.objectContaining({ date: `${year}-12-25`, openAnyway: true })]);
    expect(rows.filter((r) => r.year === year + 1)).toHaveLength(slovenianWorkFreeDays(year + 1).length);
    expect(rows.some((r) => r.year === year - 1)).toBe(false);
  });

  it("toggles one holiday in one year only and audits it", async () => {
    const { ctx } = await seedDealer("demo");
    signIn(ctx.dealerId);
    const year = thisYear();
    const rows = await listHolidays(ctx);
    const target = rows.find((r) => r.key === "christmas" && r.year === year)!;

    const result = await setHolidayOpenAnyway(ctx, target.id, true);
    expect(result).toEqual({ ok: true, holiday: { ...target, openAnyway: true } });
    const after = await listHolidays(ctx);
    expect(after.filter((r) => r.openAnyway)).toEqual([{ ...target, openAnyway: true }]);
    expect(after.find((r) => r.key === "christmas" && r.year === year + 1)?.openAnyway).toBe(false);
    expect((await audits()).find((a) => a.action === "holiday.open_anyway")).toMatchObject({
      dealerId: ctx.dealerId,
      entityId: target.id,
    });

    await setHolidayOpenAnyway(ctx, target.id, false);
    expect((await listHolidays(ctx)).every((r) => !r.openAnyway)).toBe(true);
  });

  it("returns not_found for another dealer's or an unknown holiday id", async () => {
    const { ctx: a } = await seedDealer("a");
    const { ctx: b } = await seedDealer("b");
    signIn(b.dealerId);
    const bHoliday = (await listHolidays(b))[0];
    signIn(a.dealerId);
    const before = (await audits()).length;

    expect(await setHolidayOpenAnyway(a, bHoliday.id, true)).toEqual({ ok: false, error: "not_found" });
    expect(await setHolidayOpenAnyway(a, "not-a-uuid", true)).toEqual({ ok: false, error: "not_found" });
    expect(await setHolidayOpenAnyway(a, "00000000-0000-4000-8000-000000000000", true)).toEqual({
      ok: false,
      error: "not_found",
    });
    const [row] = await db.select().from(holidayOverrides).where(eq(holidayOverrides.id, bHoliday.id));
    expect(row.openAnyway).toBe(false);
    expect(await audits()).toHaveLength(before);
  });

  it("lists without seeding for a read-only dealer and refuses toggles", async () => {
    const { ctx } = await seedDealer("demo");
    signIn(ctx.dealerId);
    const [h] = await db
      .insert(holidayOverrides)
      .values({ dealerId: ctx.dealerId, date: `${thisYear()}-12-25`, key: "christmas", name: "Božič" })
      .returning();
    await db.update(dealers).set({ status: "read_only" }).where(eq(dealers.id, ctx.dealerId));

    expect(await listHolidays(ctx)).toHaveLength(1);
    await expect(setHolidayOpenAnyway(ctx, h.id, true)).rejects.toBeInstanceOf(DealerReadOnlyError);
  });
});

describe("closures", () => {
  it("adds a closure with a public id, defaults the end to the start and audits it", async () => {
    const { ctx } = await seedDealer("demo");
    signIn(ctx.dealerId);
    const start = addDays(today(), 10);
    const result = await addClosure(ctx, { startDate: start, reason: "  Inventura  " });
    if (!result.ok) throw new Error("expected ok");
    expect(result.closure).toEqual({ id: expect.stringMatching(/^[0-9A-Za-z]{16}$/), startDate: start, endDate: start, reason: "Inventura" });
    expect(await listClosures(ctx)).toEqual([result.closure]);
    expect((await audits())[0]).toMatchObject({ action: "closure.add", entityId: result.closure.id, dealerId: ctx.dealerId });
  });

  it("accepts today and lists closures ordered by start date", async () => {
    const { ctx } = await seedDealer("demo");
    signIn(ctx.dealerId);
    await addClosure(ctx, { startDate: addDays(today(), 20), endDate: addDays(today(), 22) });
    await addClosure(ctx, { startDate: today() });
    expect((await listClosures(ctx)).map((c) => c.startDate)).toEqual([today(), addDays(today(), 20)]);
  });

  it("validates dates and reason", async () => {
    const { ctx } = await seedDealer("demo");
    signIn(ctx.dealerId);
    const start = addDays(today(), 1);
    const cases: [Parameters<typeof addClosure>[1], Record<string, string>][] = [
      [{ startDate: "" }, { startDate: "required" }],
      [{ startDate: "2026-02-30" }, { startDate: "invalid_date" }],
      [{ startDate: "21.10.2026" }, { startDate: "invalid_date" }],
      [{ startDate: addDays(today(), -1) }, { startDate: "in_past" }],
      [{ startDate: start, endDate: "tomorrow" }, { endDate: "invalid_date" }],
      [{ startDate: start, endDate: addDays(start, -1) }, { endDate: "end_before_start" }],
      [{ startDate: start, endDate: addDays(start, 366) }, { endDate: "too_long" }],
      [{ startDate: start, reason: "x".repeat(201) }, { reason: "too_long" }],
    ];
    for (const [input, errors] of cases) {
      expect(await addClosure(ctx, input), JSON.stringify(input)).toEqual({ ok: false, errors });
    }
    expect((await addClosure(ctx, { startDate: start, endDate: addDays(start, 365), reason: "x".repeat(200) })).ok).toBe(true);
    expect(await listClosures(ctx)).toHaveLength(1);
  });

  it("deletes an own closure; another dealer's closure is not_found and untouched", async () => {
    const { ctx: a } = await seedDealer("a");
    const { ctx: b } = await seedDealer("b");
    signIn(b.dealerId);
    const bClosure = await addClosure(b, { startDate: addDays(today(), 5) });
    signIn(a.dealerId);
    const aClosure = await addClosure(a, { startDate: addDays(today(), 5) });
    if (!bClosure.ok || !aClosure.ok) throw new Error("expected ok");
    const before = (await audits()).length;

    expect(await deleteClosure(a, bClosure.closure.id)).toEqual({ ok: false, error: "not_found" });
    expect(await deleteClosure(a, "unknown")).toEqual({ ok: false, error: "not_found" });
    expect(await db.select().from(dealerClosures)).toHaveLength(2);
    expect(await audits()).toHaveLength(before);

    expect(await deleteClosure(a, aClosure.closure.id)).toEqual({ ok: true });
    const remaining = await db.select().from(dealerClosures);
    expect(remaining.map((c) => c.id)).toEqual([bClosure.closure.id]);
    const audit = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.action, "closure.delete"), eq(auditLog.dealerId, a.dealerId)));
    expect(audit).toHaveLength(1);
  });
});

describe("permissions", () => {
  it("refuses a Salesperson on every function", async () => {
    const { ctx } = await seedDealer("demo");
    signIn(ctx.dealerId, "salesperson");
    const calls = [
      () => getOpeningHours(ctx),
      () => replaceOpeningHours(ctx, week),
      () => listHolidays(ctx),
      () => setHolidayOpenAnyway(ctx, "00000000-0000-4000-8000-000000000000", true),
      () => listClosures(ctx),
      () => addClosure(ctx, { startDate: today() }),
      () => deleteClosure(ctx, "x"),
    ];
    for (const call of calls) await expect(call()).rejects.toBeInstanceOf(ForbiddenError);
    expect(await audits()).toHaveLength(0);
    expect(await db.select().from(holidayOverrides)).toHaveLength(0);
  });

  it("refuses an Owner of another dealer", async () => {
    const { ctx: a } = await seedDealer("a");
    const { ctx: b } = await seedDealer("b");
    signIn(b.dealerId);
    await expect(replaceOpeningHours(a, week)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listClosures(a)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
