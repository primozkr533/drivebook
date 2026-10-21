// Real-database tests: start Postgres with `docker compose up -d db` (uses TEST_DATABASE_URL).
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { auditLog, bookingRules, dealers, plans } from "@/db/schema";
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

const { ForbiddenError } = await import("@/server/auth/permissions");
const { setDbForTests } = await import("@/server/data/db");
const { resolveDealerSlug } = await import("@/server/data/dealers");
const { getBookingRules, updateBookingRules } = await import(
  "@/server/data/settings-booking"
);

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

const valid = {
  testDriveMinutes: 60,
  viewingMinutes: 20,
  otherMinutes: 40,
  capacity: 3,
  minNoticeMinutes: 60,
  horizonDays: 30,
  bufferMinutes: 10,
  cancelCutoffMinutes: 240,
  slotIntervalMinutes: 30,
};

const rulesRows = () => db.select().from(bookingRules);
const audits = () => db.select().from(auditLog);

beforeAll(() => setDbForTests(db));
beforeEach(async () => {
  await truncateAll();
  state.user = null;
});
afterAll(async () => {
  setDbForTests(undefined);
  await db.$client.end();
});

describe("getBookingRules", () => {
  it("returns the defaults for a dealer without a rules row", async () => {
    const { ctx } = await seedDealer("demo");
    signIn(ctx.dealerId);
    expect(await getBookingRules(ctx)).toEqual({
      testDriveMinutes: 45,
      viewingMinutes: 30,
      otherMinutes: 30,
      capacity: 1,
      minNoticeMinutes: 120,
      horizonDays: 14,
      bufferMinutes: 15,
      cancelCutoffMinutes: 120,
      slotIntervalMinutes: 15,
    });
    expect(await rulesRows()).toHaveLength(0);
  });
});

describe("updateBookingRules validation", () => {
  const cases: [string, unknown, string][] = [
    ["testDriveMinutes", 10, "out_of_range"],
    ["testDriveMinutes", 245, "out_of_range"],
    ["testDriveMinutes", 47, "invalid_step"],
    ["testDriveMinutes", 45.5, "not_integer"],
    ["testDriveMinutes", "", "required"],
    ["viewingMinutes", 5, "out_of_range"],
    ["viewingMinutes", 33, "invalid_step"],
    ["otherMinutes", 241, "out_of_range"],
    ["otherMinutes", 12, "invalid_step"],
    ["capacity", 0, "out_of_range"],
    ["capacity", 21, "out_of_range"],
    ["capacity", "two", "not_integer"],
    ["minNoticeMinutes", -1, "out_of_range"],
    ["minNoticeMinutes", 10081, "out_of_range"],
    ["horizonDays", 0, "out_of_range"],
    ["horizonDays", 181, "out_of_range"],
    ["horizonDays", undefined, "required"],
    ["bufferMinutes", 121, "out_of_range"],
    ["bufferMinutes", "1e1x", "not_integer"],
    ["cancelCutoffMinutes", 10081, "out_of_range"],
    ["cancelCutoffMinutes", null, "required"],
    ["slotIntervalMinutes", 25, "invalid_step"],
    ["slotIntervalMinutes", 120, "out_of_range"],
    ["slotIntervalMinutes", "15.5", "not_integer"],
  ];

  it.each(cases)("rejects %s = %j with %s and saves nothing", async (field, value, error) => {
    const { ctx } = await seedDealer("demo");
    signIn(ctx.dealerId);
    const result = await updateBookingRules(ctx, { ...valid, [field]: value });
    expect(result).toEqual({ ok: false, errors: { [field]: error } });
    expect(await rulesRows()).toHaveLength(0);
    expect(await audits()).toHaveLength(0);
  });

  it("accepts numeric strings at the range bounds", async () => {
    const { ctx } = await seedDealer("demo");
    signIn(ctx.dealerId);
    const result = await updateBookingRules(ctx, {
      testDriveMinutes: "240",
      viewingMinutes: "10",
      otherMinutes: "10",
      capacity: "20",
      minNoticeMinutes: "0",
      horizonDays: "180",
      bufferMinutes: "0",
      cancelCutoffMinutes: "10080",
      slotIntervalMinutes: "60",
    });
    expect(result.ok).toBe(true);
  });
});

describe("updateBookingRules", () => {
  it("upserts the rules and writes before/after to audit_log", async () => {
    const { ctx } = await seedDealer("demo");
    signIn(ctx.dealerId);

    expect(await updateBookingRules(ctx, valid)).toEqual({ ok: true, rules: valid });
    expect(await getBookingRules(ctx)).toEqual(valid);

    const next = { ...valid, capacity: 5 };
    await updateBookingRules(ctx, next);
    expect(await getBookingRules(ctx)).toEqual(next);
    expect(await rulesRows()).toHaveLength(1);

    const entries = await audits();
    expect(entries).toHaveLength(2);
    const second = entries.find((e) => (e.data as { before: unknown }).before !== null)!;
    expect(second).toMatchObject({
      dealerId: ctx.dealerId,
      action: "booking_rules.update",
      actorKind: "dealer_user",
      actorId: `u-owner-${ctx.dealerId}`,
      data: { before: valid, after: next },
    });
    expect(entries.find((e) => e !== second)!.data).toEqual({ before: null, after: valid });
  });

  it("rolls back the write when the dealer is read-only", async () => {
    const { dealer, ctx } = await seedDealer("demo");
    await db.update(dealers).set({ status: "read_only" }).where(eq(dealers.id, dealer.id));
    signIn(ctx.dealerId);
    await expect(updateBookingRules(ctx, valid)).rejects.toThrow("read-only");
    expect(await rulesRows()).toHaveLength(0);
    expect(await audits()).toHaveLength(0);
  });

  it("refuses a Salesperson", async () => {
    const { ctx } = await seedDealer("demo");
    signIn(ctx.dealerId, "salesperson");
    await expect(getBookingRules(ctx)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(updateBookingRules(ctx, valid)).rejects.toBeInstanceOf(ForbiddenError);
    expect(await rulesRows()).toHaveLength(0);
  });

  it("never changes another dealer's rules", async () => {
    const a = await seedDealer("dealer-a");
    const b = await seedDealer("dealer-b");
    const bRules = { ...valid, capacity: 7 };
    signIn(b.ctx.dealerId);
    await updateBookingRules(b.ctx, bRules);

    // An Owner of A cannot act on B's context.
    signIn(a.ctx.dealerId);
    await expect(updateBookingRules(b.ctx, valid)).rejects.toBeInstanceOf(ForbiddenError);

    await updateBookingRules(a.ctx, { ...valid, capacity: 2 });
    expect(await getBookingRules(a.ctx)).toEqual({ ...valid, capacity: 2 });
    signIn(b.ctx.dealerId);
    expect(await getBookingRules(b.ctx)).toEqual(bRules);
  });
});
