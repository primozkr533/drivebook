// Real-database tests: start Postgres with `docker compose up -d db` (uses TEST_DATABASE_URL).
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { auditLog, dealerClosures, dealers, holidayOverrides, plans } from "@/db/schema";
import { addDays, ljubljanaNow } from "@/lib/date";
import { getTestDb, truncateAll } from "../setup/db";

const state = vi.hoisted(() => ({ user: null as { id: string; role: "owner" | "salesperson"; dealerId: string } | null }));
const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ refresh }));
vi.mock("next/navigation", () => ({
  redirect: (location: string) => {
    throw new Error(`redirect ${location}`);
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
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

const { setDbForTests } = await import("@/server/data/db");
const { resolveDealerSlug } = await import("@/server/data/dealers");
const { listClosures, listHolidays } = await import("@/server/data/settings-hours");
const { addClosureAction, deleteClosureAction, setHolidayOpenAnywayAction } = await import(
  "@/app/dealer-admin/(app)/settings/closures/actions"
);

const db = getTestDb();

async function seedDealer(slug: string) {
  const [plan] = await db
    .insert(plans)
    .values({ code: `plan-${slug}`, name: `Basic ${slug}`, maxCars: 20, maxUsers: 5, monthlySmsQuota: 100, priceEurCents: 4900 })
    .returning();
  await db.insert(dealers).values({
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
  });
  const resolved = await resolveDealerSlug(slug);
  if (resolved.kind !== "current") throw new Error("dealer not found");
  return resolved.ctx;
}

function signIn(dealerId: string, role: "owner" | "salesperson" = "owner") {
  state.user = { id: `u-${role}-${dealerId}`, role, dealerId };
}

const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
};

const today = () => ljubljanaNow().dateISO;
const thisYear = () => Number(today().slice(0, 4));
const audits = () => db.select().from(auditLog);
const holidayRow = async (id: string) => (await db.select().from(holidayOverrides).where(eq(holidayOverrides.id, id)))[0];
const closureRows = (dealerId: string) => db.select().from(dealerClosures).where(eq(dealerClosures.dealerId, dealerId));

beforeAll(() => setDbForTests(db));
beforeEach(async () => {
  await truncateAll();
  state.user = null;
  refresh.mockClear();
});
afterAll(async () => {
  setDbForTests(undefined);
  await db.$client.end();
});

describe("holiday toggle", () => {
  it("toggles one year's Christmas and leaves the other year's untouched", async () => {
    const ctx = await seedDealer("demo");
    signIn(ctx.dealerId);
    const holidays = await listHolidays(ctx);
    const christmas = holidays.find((h) => h.key === "christmas" && h.year === thisYear())!;
    const nextChristmas = holidays.find((h) => h.key === "christmas" && h.year === thisYear() + 1)!;

    expect(await setHolidayOpenAnywayAction({ openAnyway: false }, form({ id: christmas.id, openAnyway: "true" }))).toEqual({
      openAnyway: true,
    });
    expect(refresh).toHaveBeenCalledOnce();
    expect((await holidayRow(christmas.id)).openAnyway).toBe(true);
    expect((await holidayRow(nextChristmas.id)).openAnyway).toBe(false);

    expect(await setHolidayOpenAnywayAction({ openAnyway: true }, form({ id: christmas.id, openAnyway: "false" }))).toEqual({
      openAnyway: false,
    });
    expect((await holidayRow(christmas.id)).openAnyway).toBe(false);
  });

  it("404s on another dealer's holiday id and changes nothing", async () => {
    const a = await seedDealer("a");
    const b = await seedDealer("b");
    signIn(b.dealerId);
    const bHoliday = (await listHolidays(b))[0];
    signIn(a.dealerId);
    const before = (await audits()).length;

    await expect(
      setHolidayOpenAnywayAction({ openAnyway: false }, form({ id: bHoliday.id, openAnyway: "true" })),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect((await holidayRow(bHoliday.id)).openAnyway).toBe(false);
    expect(await audits()).toHaveLength(before);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("returns forbidden for a Salesperson and changes nothing", async () => {
    const ctx = await seedDealer("demo");
    signIn(ctx.dealerId);
    const [h] = await listHolidays(ctx);
    signIn(ctx.dealerId, "salesperson");
    const before = (await audits()).length;

    expect(await setHolidayOpenAnywayAction({ openAnyway: false }, form({ id: h.id, openAnyway: "true" }))).toEqual({
      openAnyway: false,
      error: "forbidden",
    });
    expect((await holidayRow(h.id)).openAnyway).toBe(false);
    expect(await audits()).toHaveLength(before);
  });

  it("returns readOnly for a restricted dealer", async () => {
    const ctx = await seedDealer("demo");
    signIn(ctx.dealerId);
    const [h] = await listHolidays(ctx);
    await db.update(dealers).set({ status: "read_only" }).where(eq(dealers.id, ctx.dealerId));

    expect(await setHolidayOpenAnywayAction({ openAnyway: false }, form({ id: h.id, openAnyway: "true" }))).toEqual({
      openAnyway: false,
      error: "readOnly",
    });
    expect((await holidayRow(h.id)).openAnyway).toBe(false);
  });
});

describe("closures", () => {
  it("adds a single day and a range with a reason", async () => {
    const ctx = await seedDealer("demo");
    signIn(ctx.dealerId);
    const day = addDays(today(), 3);
    const start = addDays(today(), 10);
    const end = addDays(today(), 14);

    const single = await addClosureAction({}, form({ startDate: day, endDate: "", reason: "" }));
    expect(single).toEqual({ added: expect.any(String) });
    const range = await addClosureAction({}, form({ startDate: start, endDate: end, reason: "Kolektivni dopust" }));
    expect(range).toEqual({ added: expect.any(String) });
    expect(refresh).toHaveBeenCalledTimes(2);

    expect(await listClosures(ctx)).toEqual([
      { id: single.added, startDate: day, endDate: day, reason: null },
      { id: range.added, startDate: start, endDate: end, reason: "Kolektivni dopust" },
    ]);
  });

  it("returns the end-before-start error with the submitted values", async () => {
    const ctx = await seedDealer("demo");
    signIn(ctx.dealerId);
    const values = { startDate: addDays(today(), 5), endDate: addDays(today(), 4), reason: "Inventura" };

    expect(await addClosureAction({}, form(values))).toEqual({ values, errors: { endDate: "end_before_start" } });
    expect(await closureRows(ctx.dealerId)).toHaveLength(0);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("deletes an own closure", async () => {
    const ctx = await seedDealer("demo");
    signIn(ctx.dealerId);
    const { added } = await addClosureAction({}, form({ startDate: addDays(today(), 1) }));

    expect(await deleteClosureAction({}, form({ id: added! }))).toEqual({});
    expect(await closureRows(ctx.dealerId)).toHaveLength(0);
  });

  it("404s on another dealer's closure id and changes nothing", async () => {
    const a = await seedDealer("a");
    const b = await seedDealer("b");
    signIn(b.dealerId);
    const { added } = await addClosureAction({}, form({ startDate: addDays(today(), 1) }));
    signIn(a.dealerId);
    const before = (await audits()).length;

    await expect(deleteClosureAction({}, form({ id: added! }))).rejects.toThrow("NEXT_NOT_FOUND");
    expect(await closureRows(b.dealerId)).toHaveLength(1);
    expect(await audits()).toHaveLength(before);
  });

  it("returns forbidden for a Salesperson on add and delete and changes nothing", async () => {
    const ctx = await seedDealer("demo");
    signIn(ctx.dealerId);
    const { added } = await addClosureAction({}, form({ startDate: addDays(today(), 1) }));
    signIn(ctx.dealerId, "salesperson");
    const before = (await audits()).length;
    const values = { startDate: addDays(today(), 2), endDate: "", reason: "" };

    expect(await addClosureAction({}, form(values))).toEqual({ values, error: "forbidden" });
    expect(await deleteClosureAction({}, form({ id: added! }))).toEqual({ error: "forbidden" });
    expect(await closureRows(ctx.dealerId)).toHaveLength(1);
    expect(await audits()).toHaveLength(before);
  });
});
