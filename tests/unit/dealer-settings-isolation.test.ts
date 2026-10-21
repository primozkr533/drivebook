// Real-database tests: start Postgres with `docker compose up -d db` (uses TEST_DATABASE_URL).
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  auditLog,
  bookingRules,
  dealerClosures,
  dealerUsers,
  dealers,
  holidayOverrides,
  messageLog,
  openingHours,
  plans,
} from "@/db/schema";
import { addDays, ljubljanaNow, slovenianWorkFreeDays } from "@/lib/date";
import { emptyWeek } from "@/lib/opening-hours";
import { resetConfigForTests } from "@/lib/config";
import type { DealerSession } from "@/server/auth/session";
import type { DealerContext } from "@/server/data/context";
import { createLocalStorage } from "@/server/storage/local";
import type { FileStorage } from "@/server/storage/types";
import { getTestDb, truncateAll } from "../setup/db";

const state = vi.hoisted(() => ({ session: null as DealerSession | null }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {} }),
  headers: async () => new Headers({ "x-drivebook-base-path": "/_dev/app" }),
}));
vi.mock("next/cache", () => ({ refresh: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("@/server/auth/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/auth/session")>()),
  getDealerContextFromSession: async () => state.session,
}));

let storage: FileStorage;
vi.mock("@/server/storage", () => ({ getStorage: () => storage }));

const { ForbiddenError } = await import("@/server/auth/permissions");
const { setDbForTests } = await import("@/server/data/db");
const { resolveDealerSlug } = await import("@/server/data/dealers");
const { getDealerSettings, updateDealerProfile, updateSmsSettings } = await import("@/server/data/settings-dealer");
const { getBranding, removeLogo, updatePrimaryColor, uploadLogo } = await import("@/server/data/settings-branding");
const { getBookingRules, updateBookingRules, BOOKING_RULE_DEFAULTS } = await import("@/server/data/settings-booking");
const {
  addClosure,
  deleteClosure,
  getOpeningHours,
  listClosures,
  listHolidays,
  replaceOpeningHours,
  setHolidayOpenAnyway,
} = await import("@/server/data/settings-hours");
const { changeDealerUserRole, deactivateDealerUser, inviteDealerUser, listDealerUsers, reactivateDealerUser } =
  await import("@/server/data/dealer-users");
const { saveDealerProfile, saveSmsSettings } = await import("@/app/dealer-admin/(app)/settings/dealer/actions");
const { saveLogoAction, savePrimaryColorAction } = await import("@/app/dealer-admin/(app)/settings/branding/actions");
const { saveBookingRulesAction } = await import("@/app/dealer-admin/(app)/settings/booking/actions");
const { saveOpeningHoursAction } = await import("@/app/dealer-admin/(app)/settings/hours/actions");
const { addClosureAction, deleteClosureAction, setHolidayOpenAnywayAction } = await import(
  "@/app/dealer-admin/(app)/settings/closures/actions"
);
const { changeDealerUserRoleAction, deactivateDealerUserAction, inviteDealerUserAction, reactivateDealerUserAction } =
  await import("@/app/dealer-admin/(app)/users/actions");

const db = getTestDb();
const previousAppEnv = process.env.APP_ENV;
let storageDir: string;

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);

const form = (values: Record<string, string | File>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
};

const rulesRow = (r: typeof BOOKING_RULE_DEFAULTS) => ({
  testDriveMinutes: r.testDriveMinutes,
  viewingMinutes: r.viewingMinutes,
  otherMinutes: r.otherMinutes,
  capacity: r.capacity,
  leadTimeMinutes: r.minNoticeMinutes,
  maxDaysAhead: r.horizonDays,
  bufferMinutes: r.bufferMinutes,
  cancelCutoffMinutes: r.cancelCutoffMinutes,
  slotMinutes: r.slotIntervalMinutes,
});

const A_RULES = { ...BOOKING_RULE_DEFAULTS, testDriveMinutes: 60, capacity: 2 };
const B_RULES = { ...BOOKING_RULE_DEFAULTS, testDriveMinutes: 90, capacity: 5, horizonDays: 30 };

async function seedDealer(slug: string, name: string, planId: string, extra: Partial<typeof dealers.$inferInsert> = {}) {
  await db.insert(dealers).values({
    slug,
    name,
    legalName: `${name} d.o.o.`,
    addressLine: `${name} cesta 1`,
    postalCode: "1000",
    city: "Ljubljana",
    phone: "+38611234567",
    email: `info@${slug}.si`,
    primaryColor: "#E4572E",
    planId,
    ...extra,
  });
  const resolved = await resolveDealerSlug(slug);
  if (resolved.kind !== "current") throw new Error("dealer not found");
  return resolved.ctx;
}

async function seedHolidays(dealerId: string, extra: { date: string; name: string }[] = []) {
  const year = Number(ljubljanaNow().dateISO.slice(0, 4));
  const days = [year, year + 1].flatMap((y) => slovenianWorkFreeDays(y));
  return db
    .insert(holidayOverrides)
    .values([
      ...days.map((d) => ({ dealerId, date: d.date, key: d.key, name: d.key })),
      ...extra.map((d) => ({ dealerId, date: d.date, key: null, name: d.name })),
    ])
    .returning();
}

async function seed() {
  const [plan] = await db
    .insert(plans)
    .values({ code: "basic", name: "Basic", maxCars: 20, maxUsers: 10, priceEurCents: 4900 })
    .returning();
  const a = await seedDealer("alfa", "Alfa Avto", plan.id);
  const b = await seedDealer("beta", "Beta Avto", plan.id, {
    email: "info@beta-avto.si",
    primaryColor: "#123456",
    smsSenderName: "BetaSMS",
    mapsUrl: "https://maps.app.goo.gl/beta",
    privacyUrl: "https://beta-avto.si/zasebnost",
  });

  const [aOwner, aSales, bOwner, bSales, bGone] = await db
    .insert(dealerUsers)
    .values([
      { dealerId: a.dealerId, email: "owner@alfa.si", name: "Ana", role: "owner", status: "active", passwordHash: "x" },
      { dealerId: a.dealerId, email: "sales@alfa.si", name: "Bor", role: "salesperson", status: "active", passwordHash: "x" },
      { dealerId: b.dealerId, email: "owner@beta.si", name: "Cene", role: "owner", status: "active", passwordHash: "x" },
      { dealerId: b.dealerId, email: "sales@beta.si", name: "Dora", role: "salesperson", status: "active", passwordHash: "x" },
      { dealerId: b.dealerId, email: "old@beta.si", name: "Eva", role: "salesperson", status: "deactivated", passwordHash: "x" },
    ])
    .returning();

  const year = Number(ljubljanaNow().dateISO.slice(0, 4));
  const aHolidays = await seedHolidays(a.dealerId);
  const bHolidays = await seedHolidays(b.dealerId, [{ date: `${year}-08-03`, name: "Beta dopust" }]);

  const start = addDays(ljubljanaNow().dateISO, 10);
  const [aClosure] = await db
    .insert(dealerClosures)
    .values({ dealerId: a.dealerId, startDate: start, endDate: start, reason: "Alfa inventura" })
    .returning();
  const [bClosure] = await db
    .insert(dealerClosures)
    .values({ dealerId: b.dealerId, startDate: start, endDate: addDays(start, 2), reason: "Beta selitev" })
    .returning();

  await db.insert(openingHours).values([
    { dealerId: a.dealerId, isoWeekday: 1, opensAt: "08:00", closesAt: "16:00" },
    { dealerId: b.dealerId, isoWeekday: 1, opensAt: "10:00", closesAt: "18:00" },
    { dealerId: b.dealerId, isoWeekday: 6, opensAt: "09:00", closesAt: "12:00" },
  ]);
  await db.insert(bookingRules).values([
    { dealerId: a.dealerId, ...rulesRow(A_RULES) },
    { dealerId: b.dealerId, ...rulesRow(B_RULES) },
  ]);

  const bLogoKey = "logos/beta-logo.png";
  await storage.put(bLogoKey, PNG, "image/png");
  await db.update(dealers).set({ logoKey: bLogoKey }).where(eq(dealers.id, b.dealerId));

  const bHoliday = bHolidays.find((h) => h.key === null)!;
  return { a, b, aOwner, aSales, bOwner, bSales, bGone, aHolidays, bHolidays, bHoliday, aClosure, bClosure, bLogoKey };
}

let s: Awaited<ReturnType<typeof seed>>;

const signInAs = (user: typeof s.aOwner, ctx: DealerContext) => {
  state.session = { ctx, user: { id: user.id, email: user.email, role: user.role }, sessionId: "s" };
};

const sorted = (rows: object[]) => rows.map((r) => JSON.stringify(r)).sort();

async function files(): Promise<string[]> {
  const entries = await readdir(storageDir, { recursive: true, withFileTypes: true });
  return entries.filter((e) => e.isFile()).map((e) => path.relative(storageDir, path.join(e.parentPath, e.name))).sort();
}

async function snapshot(dealerId: string) {
  return {
    dealer: sorted(await db.select().from(dealers).where(eq(dealers.id, dealerId))),
    users: sorted(await db.select().from(dealerUsers).where(eq(dealerUsers.dealerId, dealerId))),
    closures: sorted(await db.select().from(dealerClosures).where(eq(dealerClosures.dealerId, dealerId))),
    holidays: sorted(await db.select().from(holidayOverrides).where(eq(holidayOverrides.dealerId, dealerId))),
    hours: sorted(await db.select().from(openingHours).where(eq(openingHours.dealerId, dealerId))),
    rules: sorted(await db.select().from(bookingRules).where(eq(bookingRules.dealerId, dealerId))),
  };
}

function bMarkers(): string[] {
  return [
    s.b.dealerId,
    "Beta",
    "beta",
    "#123456",
    s.bLogoKey,
    s.bClosure.id,
    s.bOwner.id,
    s.bSales.id,
    s.bGone.id,
    ...s.bHolidays.map((h) => h.id),
  ];
}

function expectNoB(value: unknown) {
  const json = JSON.stringify(value);
  for (const marker of bMarkers()) expect(json).not.toContain(marker);
}

beforeAll(async () => {
  process.env.APP_ENV = "test";
  resetConfigForTests();
  setDbForTests(db);
});
beforeEach(async () => {
  if (storageDir) await rm(storageDir, { recursive: true, force: true });
  storageDir = await mkdtemp(path.join(tmpdir(), "drivebook-isolation-"));
  storage = createLocalStorage(storageDir);
  await truncateAll();
  s = await seed();
  signInAs(s.aOwner, s.a);
});
afterAll(async () => {
  if (storageDir) await rm(storageDir, { recursive: true, force: true });
  setDbForTests(undefined);
  if (previousAppEnv === undefined) delete process.env.APP_ENV;
  else process.env.APP_ENV = previousAppEnv;
  resetConfigForTests();
  await db.$client.end();
});

describe("Owner A with dealer B ids", () => {
  it("every by-id service call returns not_found and leaves B unchanged", async () => {
    const before = await snapshot(s.b.dealerId);
    const filesBefore = await files();

    expect(await deleteClosure(s.a, s.bClosure.id)).toEqual({ ok: false, error: "not_found" });
    expect(await setHolidayOpenAnyway(s.a, s.bHoliday.id, true)).toEqual({ ok: false, error: "not_found" });
    expect(await changeDealerUserRole(s.a, s.bSales.id, "owner")).toEqual({ ok: false, error: "not_found" });
    expect(await changeDealerUserRole(s.a, s.bOwner.id, "salesperson")).toEqual({ ok: false, error: "not_found" });
    expect(await deactivateDealerUser(s.a, s.bSales.id)).toEqual({ ok: false, error: "not_found" });
    expect(await deactivateDealerUser(s.a, s.bOwner.id)).toEqual({ ok: false, error: "not_found" });
    expect(await reactivateDealerUser(s.a, s.bGone.id)).toEqual({ ok: false, error: "not_found" });

    expect(await snapshot(s.b.dealerId)).toEqual(before);
    expect(await files()).toEqual(filesBefore);
    expect(await db.select().from(auditLog)).toHaveLength(0);
  });

  it.each([
    ["closure delete", () => deleteClosureAction({}, form({ id: s.bClosure.id }))],
    ["holiday open anyway", () => setHolidayOpenAnywayAction({ openAnyway: false }, form({ id: s.bHoliday.id, openAnyway: "true" }))],
    ["user role change", () => changeDealerUserRoleAction({}, form({ userId: s.bSales.id, role: "owner" }))],
    ["user deactivate", () => deactivateDealerUserAction({}, form({ userId: s.bSales.id }))],
    ["user reactivate", () => reactivateDealerUserAction({}, form({ userId: s.bGone.id }))],
  ])("the %s action 404s and leaves B unchanged", async (_name, run) => {
    const before = await snapshot(s.b.dealerId);
    await expect(run()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(await snapshot(s.b.dealerId)).toEqual(before);
    expect(await db.select().from(auditLog)).toHaveLength(0);
  });

  it("a dealer B ctx under an Owner A session is refused by every service", async () => {
    const before = await snapshot(s.b.dealerId);
    const calls: (() => Promise<unknown>)[] = [
      () => getDealerSettings(s.b),
      () => getBranding(s.b),
      () => getBookingRules(s.b),
      () => getOpeningHours(s.b),
      () => listHolidays(s.b),
      () => listClosures(s.b),
      () => listDealerUsers(s.b),
      () => deleteClosure(s.b, s.bClosure.id),
      () => setHolidayOpenAnyway(s.b, s.bHoliday.id, true),
      () => deactivateDealerUser(s.b, s.bSales.id),
      () => removeLogo(s.b),
    ];
    for (const call of calls) await expect(call()).rejects.toBeInstanceOf(ForbiddenError);
    expect(await snapshot(s.b.dealerId)).toEqual(before);
    expect(await files()).toContain(s.bLogoKey);
    expect(await db.select().from(auditLog)).toHaveLength(0);
  });
});

describe("Owner A settings reads", () => {
  it("return only dealer A's data", async () => {
    const settings = await getDealerSettings(s.a);
    expect(settings).toMatchObject({ name: "Alfa Avto", email: "info@alfa.si", googleMapsUrl: null, smsSenderName: null });
    expectNoB(settings);

    const branding = await getBranding(s.a);
    expect(branding).toEqual({ primaryColor: "#E4572E", logoUrl: null });
    expectNoB(branding);

    expect(await getBookingRules(s.a)).toEqual(A_RULES);

    expect(await getOpeningHours(s.a)).toEqual({ ...emptyWeek(), 1: [{ opens: "08:00", closes: "16:00" }] });

    const holidays = await listHolidays(s.a);
    expect(holidays.map((h) => h.id).sort()).toEqual(s.aHolidays.map((h) => h.id).sort());
    expectNoB(holidays);

    const closures = await listClosures(s.a);
    expect(closures).toEqual([
      { id: s.aClosure.id, startDate: s.aClosure.startDate, endDate: s.aClosure.endDate, reason: "Alfa inventura" },
    ]);
    expectNoB(closures);

    const users = await listDealerUsers(s.a);
    expect(users.users.map((u) => u.id).sort()).toEqual([s.aOwner.id, s.aSales.id].sort());
    expect(users.used).toBe(2);
    expectNoB(users);

    expect(await db.select().from(auditLog)).toHaveLength(0);
  });
});

describe("Salesperson A", () => {
  beforeEach(() => signInAs(s.aSales, s.a));

  it("gets ForbiddenError from every settings and users service function", async () => {
    const before = [await snapshot(s.a.dealerId), await snapshot(s.b.dealerId)];
    const filesBefore = await files();
    const calls: [string, () => Promise<unknown>][] = [
      ["getDealerSettings", () => getDealerSettings(s.a)],
      ["updateDealerProfile", () => updateDealerProfile(s.a, { name: "Prevzem" })],
      ["updateSmsSettings", () => updateSmsSettings(s.a, { smsSenderName: "Prevzem", smsNotificationsEnabled: false })],
      ["getBranding", () => getBranding(s.a)],
      ["updatePrimaryColor", () => updatePrimaryColor(s.a, "#000000")],
      ["uploadLogo", () => uploadLogo(s.a, { bytes: PNG, filename: "logo.png", declaredType: "image/png" })],
      ["removeLogo", () => removeLogo(s.a)],
      ["getBookingRules", () => getBookingRules(s.a)],
      ["updateBookingRules", () => updateBookingRules(s.a, { ...BOOKING_RULE_DEFAULTS })],
      ["getOpeningHours", () => getOpeningHours(s.a)],
      ["replaceOpeningHours", () => replaceOpeningHours(s.a, emptyWeek())],
      ["listHolidays", () => listHolidays(s.a)],
      ["setHolidayOpenAnyway", () => setHolidayOpenAnyway(s.a, s.aHolidays[0].id, true)],
      ["listClosures", () => listClosures(s.a)],
      ["addClosure", () => addClosure(s.a, { startDate: addDays(ljubljanaNow().dateISO, 3) })],
      ["deleteClosure", () => deleteClosure(s.a, s.aClosure.id)],
      ["listDealerUsers", () => listDealerUsers(s.a)],
      ["inviteDealerUser", () => inviteDealerUser(s.a, { email: "nova@alfa.si", name: "Nova", role: "owner" })],
      ["changeDealerUserRole", () => changeDealerUserRole(s.a, s.aSales.id, "owner")],
      ["deactivateDealerUser", () => deactivateDealerUser(s.a, s.aOwner.id)],
      ["reactivateDealerUser", () => reactivateDealerUser(s.a, s.aSales.id)],
    ];
    for (const [name, call] of calls) {
      await expect(call(), name).rejects.toBeInstanceOf(ForbiddenError);
    }
    expect([await snapshot(s.a.dealerId), await snapshot(s.b.dealerId)]).toEqual(before);
    expect(await files()).toEqual(filesBefore);
    expect(await db.select().from(auditLog)).toHaveLength(0);
    expect(await db.select().from(messageLog)).toHaveLength(0);
  });

  it.each([
    ["saveDealerProfile", () => saveDealerProfile({}, form({ name: "Prevzem", email: "x@x.si" })), { error: "forbidden" }],
    ["saveSmsSettings", () => saveSmsSettings({}, form({ smsSenderName: "Prevzem" })), { error: "forbidden" }],
    ["savePrimaryColorAction", () => savePrimaryColorAction({}, form({ primaryColor: "#000000" })), { error: "forbidden" }],
    [
      "saveLogoAction (upload)",
      () => saveLogoAction({ logoUrl: null }, form({ logo: new File([PNG], "logo.png", { type: "image/png" }) })),
      { logoUrl: null, error: "forbidden" },
    ],
    ["saveLogoAction (remove)", () => saveLogoAction({ logoUrl: null }, form({ intent: "remove" })), { error: "forbidden" }],
    [
      "saveBookingRulesAction",
      () => saveBookingRulesAction({}, form(Object.fromEntries(Object.entries(BOOKING_RULE_DEFAULTS).map(([k, v]) => [k, String(v)])))),
      { error: "forbidden" },
    ],
    ["saveOpeningHoursAction", () => saveOpeningHoursAction(emptyWeek()), { ok: false, error: "forbidden" }],
    [
      "setHolidayOpenAnywayAction",
      () => setHolidayOpenAnywayAction({ openAnyway: false }, form({ id: s.aHolidays[0].id, openAnyway: "true" })),
      { openAnyway: false, error: "forbidden" },
    ],
    [
      "addClosureAction",
      () => addClosureAction({}, form({ startDate: addDays(ljubljanaNow().dateISO, 3), endDate: "", reason: "" })),
      { error: "forbidden" },
    ],
    ["deleteClosureAction", () => deleteClosureAction({}, form({ id: s.aClosure.id })), { error: "forbidden" }],
    [
      "inviteDealerUserAction",
      () => inviteDealerUserAction({}, form({ email: "nova@alfa.si", name: "Nova", role: "owner" })),
      { error: "forbidden" },
    ],
    [
      "changeDealerUserRoleAction",
      () => changeDealerUserRoleAction({}, form({ userId: s.aSales.id, role: "owner" })),
      { error: "forbidden" },
    ],
    ["deactivateDealerUserAction", () => deactivateDealerUserAction({}, form({ userId: s.aOwner.id })), { error: "forbidden" }],
    ["reactivateDealerUserAction", () => reactivateDealerUserAction({}, form({ userId: s.aSales.id })), { error: "forbidden" }],
  ] as [string, () => Promise<unknown>, object][])(
    "%s returns forbidden with no write and no audit_log row",
    async (_name, run, expected) => {
      const before = [await snapshot(s.a.dealerId), await snapshot(s.b.dealerId)];
      const filesBefore = await files();
      expect(await run()).toMatchObject(expected);
      expect([await snapshot(s.a.dealerId), await snapshot(s.b.dealerId)]).toEqual(before);
      expect(await files()).toEqual(filesBefore);
      expect(await db.select().from(auditLog)).toHaveLength(0);
      expect(await db.select().from(messageLog)).toHaveLength(0);
    },
  );
});
