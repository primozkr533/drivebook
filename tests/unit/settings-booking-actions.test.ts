// Real-database tests: start Postgres with `docker compose up -d db` (uses TEST_DATABASE_URL).
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

const { setDbForTests } = await import("@/server/data/db");
const { saveBookingRulesAction } = await import("@/app/dealer-admin/(app)/settings/booking/actions");
const { toFormValues, toRulesInput } = await import("@/app/dealer-admin/(app)/settings/booking/fields");
const { BOOKING_RULE_DEFAULTS } = await import("@/server/data/settings-booking");

const db = getTestDb();

async function seedDealer() {
  const [plan] = await db
    .insert(plans)
    .values({ code: "plan-demo", name: "Basic", maxCars: 20, maxUsers: 5, monthlySmsQuota: 100, priceEurCents: 4900 })
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
  return dealer;
}

const formValues = {
  testDriveMinutes: "60",
  viewingMinutes: "20",
  otherMinutes: "40",
  capacity: "3",
  minNoticeHours: "3",
  horizonDays: "30",
  bufferMinutes: "10",
  cancelCutoffHours: "1,5",
  slotIntervalMinutes: "30",
};

const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
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

describe("booking form mapping", () => {
  it("shows the defaults with notice and cut-off in hours", () => {
    expect(toFormValues(BOOKING_RULE_DEFAULTS)).toEqual({
      testDriveMinutes: "45",
      viewingMinutes: "30",
      otherMinutes: "30",
      capacity: "1",
      minNoticeHours: "2",
      horizonDays: "14",
      bufferMinutes: "15",
      cancelCutoffHours: "2",
      slotIntervalMinutes: "15",
    });
  });

  it("maps form fields onto the service names, converting hours to minutes", () => {
    expect(toRulesInput(formValues)).toEqual({
      testDriveMinutes: "60",
      viewingMinutes: "20",
      otherMinutes: "40",
      capacity: "3",
      minNoticeMinutes: 180,
      horizonDays: "30",
      bufferMinutes: "10",
      cancelCutoffMinutes: 90,
      slotIntervalMinutes: "30",
    });
    expect(toRulesInput({ ...formValues, minNoticeHours: " ", cancelCutoffHours: "abc" })).toMatchObject({
      minNoticeMinutes: "",
      cancelCutoffMinutes: "abc",
    });
    expect(toRulesInput({ ...formValues, minNoticeHours: "1.1" }).minNoticeMinutes).toBe(66);
  });
});

describe("saveBookingRulesAction", () => {
  it("stores a 3 h minimum notice as 180 minutes", async () => {
    const dealer = await seedDealer();
    state.user = { id: "owner-1", role: "owner", dealerId: dealer.id };
    const result = await saveBookingRulesAction({}, form(formValues));
    expect(result).toEqual({ values: { ...formValues, cancelCutoffHours: "1.5" }, saved: true });
    const [row] = await rulesRows();
    expect(row).toMatchObject({ dealerId: dealer.id, leadTimeMinutes: 180, cancelCutoffMinutes: 90, slotMinutes: 30, capacity: 3 });
    expect((await audits()).map((a) => a.action)).toEqual(["booking_rules.update"]);
  });

  it("returns per-field errors for out-of-range values and saves nothing", async () => {
    const dealer = await seedDealer();
    state.user = { id: "owner-1", role: "owner", dealerId: dealer.id };
    const values = { ...formValues, minNoticeHours: "200", testDriveMinutes: "47", capacity: "" };
    expect(await saveBookingRulesAction({}, form(values))).toEqual({
      values,
      errors: { minNoticeHours: "out_of_range", testDriveMinutes: "invalid_step", capacity: "required" },
    });
    expect(await rulesRows()).toHaveLength(0);
    expect(await audits()).toHaveLength(0);
  });

  it("returns forbidden for a Salesperson and changes nothing", async () => {
    const dealer = await seedDealer();
    state.user = { id: "sales-1", role: "salesperson", dealerId: dealer.id };
    expect(await saveBookingRulesAction({}, form(formValues))).toEqual({ values: formValues, error: "forbidden" });
    expect(await rulesRows()).toHaveLength(0);
    expect(await audits()).toHaveLength(0);
  });

  it("returns readOnly for a restricted dealer and changes nothing", async () => {
    const dealer = await seedDealer();
    await db.update(dealers).set({ status: "read_only" });
    state.user = { id: "owner-1", role: "owner", dealerId: dealer.id };
    expect(await saveBookingRulesAction({}, form(formValues))).toEqual({ values: formValues, error: "readOnly" });
    expect(await rulesRows()).toHaveLength(0);
  });

  it("redirects to login without a session", async () => {
    await expect(saveBookingRulesAction({}, form(formValues))).rejects.toThrow("redirect");
  });
});
