// Real-database tests: start Postgres with `docker compose up -d db` (uses TEST_DATABASE_URL).
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { auditLog, dealers, plans } from "@/db/schema";
import { createDealerContext, type DealerContext } from "@/server/data/context";
import type { DealerSession } from "@/server/auth/session";
import { getTestDb, truncateAll } from "../setup/db";

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
  headers: async () => new Headers(),
}));
vi.mock("next/navigation", () => ({
  redirect: (location: string) => {
    throw new Error(`redirect ${location}`);
  },
}));

let session: DealerSession | null = null;
vi.mock("@/server/auth/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/auth/session")>();
  return { ...actual, getDealerContextFromSession: async () => session };
});

const { DealerReadOnlyError, ForbiddenError } = await import("@/server/auth/permissions");
const { setDbForTests } = await import("@/server/data/db");
const { defaultSmsSenderName, getDealerSettings, updateDealerProfile, updateSmsSettings } = await import(
  "@/server/data/settings-dealer"
);

const db = getTestDb();

async function seedDealer(planId: string, slug: string, legalName = slug) {
  const [dealer] = await db
    .insert(dealers)
    .values({
      slug,
      name: slug,
      legalName,
      addressLine: "Dunajska cesta 1",
      postalCode: "1000",
      city: "Ljubljana",
      phone: "+38611234567",
      email: `info@${slug}.si`,
      primaryColor: "#E4572E",
      planId,
    })
    .returning();
  return { dealer, ctx: createDealerContext(dealer) };
}

function signIn(ctx: DealerContext, role: "owner" | "salesperson" = "owner"): void {
  session = { ctx, user: { id: `u-${role}-${ctx.slug}`, email: `${role}@${ctx.slug}.si`, role }, sessionId: "s" };
}

const row = async (id: string) => (await db.select().from(dealers).where(eq(dealers.id, id)))[0];
const audits = () => db.select().from(auditLog);

const profile = {
  name: "Avto Novak",
  addressLine: " Celovška 10 ",
  postalCode: "1000",
  city: "Ljubljana",
  phone: "01 234 56 78",
  email: "Info@Novak.si",
  googleMapsUrl: "https://maps.app.goo.gl/abc123",
  privacyPolicyUrl: "https://novak.si/zasebnost",
};

let a: Awaited<ReturnType<typeof seedDealer>>;
let b: Awaited<ReturnType<typeof seedDealer>>;

beforeAll(() => setDbForTests(db));
beforeEach(async () => {
  await truncateAll();
  session = null;
  const [plan] = await db
    .insert(plans)
    .values({ code: "basic", name: "Basic", maxCars: 20, maxUsers: 5, monthlySmsQuota: 100, priceEurCents: 4900 })
    .returning();
  a = await seedDealer(plan.id, "alpha");
  b = await seedDealer(plan.id, "beta");
  signIn(a.ctx);
});
afterAll(async () => {
  setDbForTests(undefined);
  await db.$client.end();
});

describe("getDealerSettings", () => {
  it("returns the own dealer's settings with a derived SMS sender", async () => {
    const settings = await getDealerSettings(a.ctx);
    expect(settings).toMatchObject({
      name: "alpha",
      email: "info@alpha.si",
      smsSenderName: null,
      effectiveSmsSenderName: "alpha",
      smsNotificationsEnabled: false,
      notificationPhone: null,
    });
  });

  it("returns the stored sender name when set", async () => {
    await db.update(dealers).set({ smsSenderName: "Novak" }).where(eq(dealers.id, a.dealer.id));
    expect(await getDealerSettings(a.ctx)).toMatchObject({ smsSenderName: "Novak", effectiveSmsSenderName: "Novak" });
  });

  it("refuses another dealer's context and a Salesperson", async () => {
    await expect(getDealerSettings(b.ctx)).rejects.toBeInstanceOf(ForbiddenError);
    signIn(a.ctx, "salesperson");
    await expect(getDealerSettings(a.ctx)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("updateDealerProfile", () => {
  it("saves normalised values and writes audit_log", async () => {
    expect(await updateDealerProfile(a.ctx, profile)).toEqual({ ok: true });
    expect(await row(a.dealer.id)).toMatchObject({
      name: "Avto Novak",
      legalName: "Avto Novak",
      addressLine: "Celovška 10",
      phone: "+38612345678",
      email: "info@novak.si",
      mapsUrl: "https://maps.app.goo.gl/abc123",
      privacyUrl: "https://novak.si/zasebnost",
    });
    const entries = await audits();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      dealerId: a.dealer.id,
      action: "dealer.settings.profile.update",
      actorKind: "dealer_user",
      actorId: "u-owner-alpha",
    });
  });

  it("clears optional fields when empty", async () => {
    const result = await updateDealerProfile(a.ctx, { name: "Alpha", phone: "", email: "", googleMapsUrl: "" });
    expect(result).toEqual({ ok: true });
    expect(await row(a.dealer.id)).toMatchObject({ addressLine: "", phone: "", email: "", mapsUrl: null, privacyUrl: null });
  });

  it.each([
    [{ name: "  " }, "name", "required"],
    [{ name: "A" }, "name", "too_short"],
    [{ name: "x".repeat(101) }, "name", "too_long"],
    [{ email: "not-an-email" }, "email", "invalid"],
    [{ phone: "12" }, "phone", "invalid"],
    [{ googleMapsUrl: "http://maps.app.goo.gl/abc" }, "googleMapsUrl", "invalid"],
    [{ googleMapsUrl: "https://evil.example/maps" }, "googleMapsUrl", "invalid"],
    [{ googleMapsUrl: "https://goo.gl/other" }, "googleMapsUrl", "invalid"],
    [{ privacyPolicyUrl: "http://novak.si/zasebnost" }, "privacyPolicyUrl", "invalid"],
    [{ privacyPolicyUrl: "zasebnost" }, "privacyPolicyUrl", "invalid"],
  ])("rejects %o and saves nothing", async (override, field, error) => {
    const before = await row(a.dealer.id);
    expect(await updateDealerProfile(a.ctx, { ...profile, ...override })).toEqual({ ok: false, field, error });
    expect(await row(a.dealer.id)).toEqual(before);
    expect(await audits()).toHaveLength(0);
  });

  it.each(["https://www.google.com/maps/place/x", "https://maps.google.com/?q=x", "https://goo.gl/maps/abc"])(
    "accepts the maps URL %s",
    async (googleMapsUrl) => {
      expect(await updateDealerProfile(a.ctx, { ...profile, googleMapsUrl })).toEqual({ ok: true });
    },
  );

  it("keeps a legalName that differs from the name on rename", async () => {
    await db.update(dealers).set({ legalName: "Alpha d.o.o." }).where(eq(dealers.id, a.dealer.id));
    expect(await updateDealerProfile(a.ctx, profile)).toEqual({ ok: true });
    expect(await row(a.dealer.id)).toMatchObject({ name: "Avto Novak", legalName: "Alpha d.o.o." });
  });

  it("never changes dealer B", async () => {
    const before = await row(b.dealer.id);
    await updateDealerProfile(a.ctx, profile);
    await updateSmsSettings(a.ctx, { smsSenderName: "Alpha", smsNotificationsEnabled: true, notificationPhone: "041 123 456" });
    expect(await row(b.dealer.id)).toEqual(before);
    await expect(updateDealerProfile(b.ctx, profile)).rejects.toBeInstanceOf(ForbiddenError);
    expect(await row(b.dealer.id)).toEqual(before);
    expect((await audits()).every((e) => e.dealerId === a.dealer.id)).toBe(true);
  });

  it("refuses a Salesperson", async () => {
    signIn(a.ctx, "salesperson");
    await expect(updateDealerProfile(a.ctx, profile)).rejects.toBeInstanceOf(ForbiddenError);
    expect((await row(a.dealer.id)).name).toBe("alpha");
  });

  it.each(["read_only", "suspended"] as const)("blocks a %s dealer", async (status) => {
    await db.update(dealers).set({ status }).where(eq(dealers.id, a.dealer.id));
    await expect(updateDealerProfile(a.ctx, profile)).rejects.toBeInstanceOf(DealerReadOnlyError);
    await expect(
      updateSmsSettings(a.ctx, { smsNotificationsEnabled: false, smsSenderName: "Alpha" }),
    ).rejects.toBeInstanceOf(DealerReadOnlyError);
    expect(await row(a.dealer.id)).toMatchObject({ name: "alpha", smsSenderName: null });
    expect(await audits()).toHaveLength(0);
  });
});

describe("updateSmsSettings", () => {
  it("accepts 'Avto Novak' and stores the phone as E.164", async () => {
    const result = await updateSmsSettings(a.ctx, {
      smsSenderName: "Avto Novak",
      smsNotificationsEnabled: true,
      notificationPhone: "041 123 456",
    });
    expect(result).toEqual({ ok: true });
    expect(await row(a.dealer.id)).toMatchObject({
      smsSenderName: "Avto Novak",
      smsNotificationsEnabled: true,
      notificationPhone: "+38641123456",
    });
    expect(await audits()).toMatchObject([{ action: "dealer.settings.sms.update", dealerId: a.dealer.id }]);
  });

  it("stores an empty sender name as the default", async () => {
    await db.update(dealers).set({ smsSenderName: "Old" }).where(eq(dealers.id, a.dealer.id));
    expect(await updateSmsSettings(a.ctx, { smsSenderName: " ", smsNotificationsEnabled: false })).toEqual({ ok: true });
    expect(await row(a.dealer.id)).toMatchObject({ smsSenderName: null, notificationPhone: null });
  });

  it.each([
    ["Avto Novak 1", "too_long"],
    ["Avto-Novak!", "invalid"],
    ["12345", "invalid"],
    ["Avtohiša", "invalid"],
  ])("rejects the sender name %s", async (smsSenderName, error) => {
    expect(await updateSmsSettings(a.ctx, { smsSenderName, smsNotificationsEnabled: false })).toEqual({
      ok: false,
      field: "smsSenderName",
      error,
    });
    expect(await audits()).toHaveLength(0);
  });

  it("requires a valid notification phone when notifications are on", async () => {
    expect(await updateSmsSettings(a.ctx, { smsNotificationsEnabled: true, notificationPhone: "" })).toEqual({
      ok: false,
      field: "notificationPhone",
      error: "required",
    });
    expect(await updateSmsSettings(a.ctx, { smsNotificationsEnabled: true, notificationPhone: "041" })).toEqual({
      ok: false,
      field: "notificationPhone",
      error: "invalid",
    });
    expect((await row(a.dealer.id)).smsNotificationsEnabled).toBe(false);
    expect(await audits()).toHaveLength(0);
  });

  it("refuses a Salesperson", async () => {
    signIn(a.ctx, "salesperson");
    await expect(updateSmsSettings(a.ctx, { smsNotificationsEnabled: false })).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("defaultSmsSenderName", () => {
  it("strips diacritics and disallowed characters and fits 11 chars", () => {
    const name = defaultSmsSenderName("Avtohiša Čebašek d.o.o.");
    expect(name).toMatch(/^[A-Za-z0-9 ]{1,11}$/);
    expect(name).toBe("Avtohisa Ce");
    expect(defaultSmsSenderName("Đurić & Žagar")).toBe("Duric Zagar");
    expect(defaultSmsSenderName("  Avto   Ćosić  ")).toBe("Avto Cosic");
  });

  it("trims a trailing space left by the cut and falls back to DriveBook", () => {
    expect(defaultSmsSenderName("Avtocenter Kranj")).toBe("Avtocenter");
    expect(defaultSmsSenderName("123 456")).toBe("DriveBook");
    expect(defaultSmsSenderName("!!!")).toBe("DriveBook");
  });
});
