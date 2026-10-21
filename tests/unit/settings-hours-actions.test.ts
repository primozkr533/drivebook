// Real-database tests: start Postgres with `docker compose up -d db` (uses TEST_DATABASE_URL).
import { eq } from "drizzle-orm";
import { createTranslator } from "next-intl";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { auditLog, dealers, openingHours, plans } from "@/db/schema";
import { getTestDb, truncateAll } from "../setup/db";
import { messages } from "./i18n";

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
const { getOpeningHours } = await import("@/server/data/settings-hours");
const { createDealerContext } = await import("@/server/data/context");
const { saveOpeningHoursAction } = await import("@/app/dealer-admin/(app)/settings/hours/actions");

const db = getTestDb();
const t = createTranslator({ locale: "sl", messages, namespace: "settingsHours" });

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
  return dealer;
}

function signIn(dealerId: string, role: "owner" | "salesperson" = "owner") {
  state.user = { id: `u-${role}-${dealerId}`, role, dealerId };
}

const hoursRows = (dealerId: string) => db.select().from(openingHours).where(eq(openingHours.dealerId, dealerId));
const audits = () => db.select().from(auditLog);

const week = {
  1: [
    { opens: "08:00", closes: "12:00" },
    { opens: "13:00", closes: "17:00" },
  ],
  2: [{ opens: "08:00", closes: "17:00" }],
  3: [{ opens: "08:00", closes: "17:00" }],
  4: [{ opens: "08:00", closes: "17:00" }],
  5: [{ opens: "08:00", closes: "15:00" }],
  6: [{ opens: "09:00", closes: "12:00" }],
  7: [],
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

describe("saveOpeningHoursAction", () => {
  it("saves a week with a closed day and reloads it identically", async () => {
    const dealer = await seedDealer("demo");
    signIn(dealer.id);
    expect(await saveOpeningHoursAction(week)).toEqual({ ok: true, week });
    expect(await getOpeningHours(createDealerContext({ id: dealer.id, slug: "demo", status: "active" }))).toEqual(week);
    expect(await hoursRows(dealer.id)).toHaveLength(7);
  });

  it("returns forbidden for a Salesperson and changes nothing", async () => {
    const dealer = await seedDealer("demo");
    await db.insert(openingHours).values({ dealerId: dealer.id, isoWeekday: 3, opensAt: "07:00", closesAt: "19:00" });
    signIn(dealer.id, "salesperson");
    expect(await saveOpeningHoursAction(week)).toEqual({ ok: false, error: "forbidden" });
    const rows = await hoursRows(dealer.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ isoWeekday: 3, opensAt: "07:00:00", closesAt: "19:00:00" });
    expect(await audits()).toHaveLength(0);
  });

  it("rejects overlapping and inverted ranges with translatable row errors", async () => {
    const dealer = await seedDealer("demo");
    signIn(dealer.id);
    const result = await saveOpeningHoursAction({
      1: [
        { opens: "08:00", closes: "12:00" },
        { opens: "11:00", closes: "14:00" },
      ],
      2: [{ opens: "17:00", closes: "09:00" }],
    });
    expect(result).toEqual({
      ok: false,
      errors: [
        { day: 1, index: 1, error: "overlap" },
        { day: 2, index: 0, error: "end_before_start" },
      ],
    });
    if (result.ok || !("errors" in result)) throw new Error("expected row errors");
    for (const e of result.errors) expect(t(`errors.${e.error}`, { max: 4 })).not.toContain("errors.");
    expect(await hoursRows(dealer.id)).toHaveLength(0);
  });

  it("coerces malformed input into invalid_time errors instead of throwing", async () => {
    const dealer = await seedDealer("demo");
    signIn(dealer.id);
    expect(await saveOpeningHoursAction({ 1: [{ opens: 8 }, null], 2: "x" })).toEqual({
      ok: false,
      errors: [
        { day: 1, index: 0, error: "invalid_time" },
        { day: 1, index: 1, error: "invalid_time" },
      ],
    });
  });

  it("returns readOnly for a restricted dealer", async () => {
    const dealer = await seedDealer("demo");
    await db.update(dealers).set({ status: "read_only" }).where(eq(dealers.id, dealer.id));
    signIn(dealer.id);
    expect(await saveOpeningHoursAction(week)).toEqual({ ok: false, error: "readOnly" });
    expect(await hoursRows(dealer.id)).toHaveLength(0);
  });

  it("requires a dealer session", async () => {
    await expect(saveOpeningHoursAction(week)).rejects.toThrow(/redirect/);
  });
});
