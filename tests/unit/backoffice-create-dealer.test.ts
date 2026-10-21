// Real-database tests: start Postgres with `docker compose up -d db` (uses TEST_DATABASE_URL).
import { count, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  auditLog,
  authTokens,
  backofficeUsers,
  bookingRules,
  dealerLicenceHistory,
  dealers,
  dealerUsers,
  holidayOverrides,
  messageLog,
  openingHours,
  plans,
} from "@/db/schema";
import { resetConfigForTests } from "@/lib/config";
import { slovenianWorkFreeDays } from "@/lib/date";
import type { BackofficeSessionUser } from "@/server/auth/session";
import { getTestDb, truncateAll } from "../setup/db";

const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined) }),
  headers: async () => new Headers(),
}));
vi.mock("next/navigation", () => ({
  redirect: (location: string) => {
    throw new Error(`redirect ${location}`);
  },
}));

const sessions = new Map<string, BackofficeSessionUser>();
vi.mock("@/server/auth/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/auth/session")>();
  return {
    ...actual,
    getCurrentSession: async (surface: string) => {
      const token = surface === "backoffice" ? jar.get(actual.SESSION_COOKIE.backoffice) : undefined;
      const user = token ? sessions.get(token) : undefined;
      return user ? { session: { id: "s" }, user } : null;
    },
  };
});

// Runs once right after the next validateSlug call, to simulate another operator racing the creation.
let afterSlugValidated: (() => Promise<void>) | undefined;
vi.mock("@/server/data/backoffice/slug", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/data/backoffice/slug")>();
  return {
    ...actual,
    validateSlug: async (...args: Parameters<typeof actual.validateSlug>) => {
      const result = await actual.validateSlug(...args);
      const hook = afterSlugValidated;
      afterSlugValidated = undefined;
      await hook?.();
      return result;
    },
  };
});

const { SESSION_COOKIE } = await import("@/server/auth/session");
const { ForbiddenError } = await import("@/server/auth/permissions");
const { setDbForTests } = await import("@/server/data/db");
const { resolveDealerSlug } = await import("@/server/data/dealers");
const { listOpeningHours } = await import("@/server/data/hours");
const { createDealer } = await import("@/server/data/backoffice/dealers");
const { drainNotificationsForTest, stopBossForTests } = await import("@/server/notify/queue");

const db = getTestDb();
const previousAppEnv = process.env.APP_ENV;
const NOW = new Date("2026-10-21T10:00:00Z");

async function signInBackoffice(role: "superadmin" | "support") {
  const [row] = await db
    .insert(backofficeUsers)
    .values({ email: `${role}@drivebook.si`, name: role, role, status: "active" })
    .returning();
  sessions.set(`tok-${row.id}`, { id: row.id, email: row.email, name: row.name, role, status: "active" });
  jar.set(SESSION_COOKIE.backoffice, `tok-${row.id}`);
  return row;
}

async function seedPlan() {
  const [plan] = await db
    .insert(plans)
    .values({ code: "basic", name: "Basic", maxCars: 20, maxUsers: 5, monthlySmsQuota: 100, priceEurCents: 4900 })
    .returning();
  return plan;
}

const novakInput = (planId: string) => ({
  name: "Avto Novak",
  slug: "novak",
  ownerEmail: " Owner@Novak.si ",
  planId,
  licenceValidUntil: "2027-10-31",
  notes: "Pilot",
});

const countOf = async (table: typeof dealers | typeof auditLog | typeof messageLog | typeof dealerUsers) =>
  (await db.select({ n: count() }).from(table))[0].n;

beforeAll(() => {
  process.env.APP_ENV = "test";
  resetConfigForTests();
  setDbForTests(db);
});
beforeEach(async () => {
  await truncateAll();
  await drainNotificationsForTest();
  await truncateAll();
  jar.clear();
  sessions.clear();
});
afterAll(async () => {
  await stopBossForTests();
  setDbForTests(undefined);
  if (previousAppEnv === undefined) delete process.env.APP_ENV;
  else process.env.APP_ENV = previousAppEnv;
  resetConfigForTests();
});

describe("createDealer", () => {
  it("creates the dealer with booking rules, holidays, no open hours and an invited owner", async () => {
    const plan = await seedPlan();
    const admin = await signInBackoffice("superadmin");

    const result = await createDealer(novakInput(plan.id), { now: NOW });
    expect(result).toEqual({ ok: true, id: expect.any(String), slug: "novak" });
    if (!result.ok) return;

    const [dealer] = await db.select().from(dealers).where(eq(dealers.id, result.id));
    expect(dealer).toMatchObject({
      name: "Avto Novak",
      slug: "novak",
      status: "active",
      planId: plan.id,
      notes: "Pilot",
      licenceValidUntil: "2027-10-31",
    });

    const [rules] = await db.select().from(bookingRules).where(eq(bookingRules.dealerId, result.id));
    expect(rules).toMatchObject({ slotMinutes: 30, leadTimeMinutes: 120, maxDaysAhead: 30, requirePhoneVerification: true });

    const holidays = await db.select().from(holidayOverrides).where(eq(holidayOverrides.dealerId, result.id));
    const expected = [...slovenianWorkFreeDays(2026), ...slovenianWorkFreeDays(2027)];
    expect(holidays).toHaveLength(expected.length);
    expect(holidays.every((h) => !h.isOpen)).toBe(true);
    expect(holidays).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ date: "2026-05-24", key: "whitSunday", name: "binkoštna nedelja" }),
        expect.objectContaining({ date: "2027-05-16", key: "whitSunday", name: "binkoštna nedelja" }),
      ]),
    );

    expect(await db.select().from(openingHours).where(eq(openingHours.dealerId, result.id))).toEqual([]);

    const resolved = await resolveDealerSlug("novak");
    expect(resolved.kind).toBe("current");
    if (resolved.kind === "current") {
      expect(resolved.dealer.name).toBe("Avto Novak");
      expect(await listOpeningHours(resolved.ctx)).toEqual([]);
    }

    const [owner] = await db.select().from(dealerUsers).where(eq(dealerUsers.dealerId, result.id));
    expect(owner).toMatchObject({ email: "owner@novak.si", role: "owner", status: "invited", passwordHash: null });

    const [token] = await db.select().from(authTokens).where(eq(authTokens.userId, owner.id));
    expect(token).toMatchObject({ surface: "dealer", purpose: "invite", usedAt: null });
    expect(token.expiresAt.getTime() - NOW.getTime()).toBe(7 * 24 * 60 * 60 * 1000);

    await drainNotificationsForTest();
    const logs = await db.select().from(messageLog);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ channel: "email", recipient: "owner@novak.si", template: "invitation", dealerId: result.id });

    const audits = await db.select().from(auditLog);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      action: "dealer.create",
      entity: "dealer",
      entityId: result.id,
      dealerId: result.id,
      actorKind: "backoffice_user",
      actorId: admin.id,
    });

    const licences = await db.select().from(dealerLicenceHistory);
    expect(licences).toHaveLength(1);
    expect(licences[0]).toMatchObject({
      dealerId: result.id,
      planId: plan.id,
      previousValidUntil: null,
      validUntil: "2027-10-31",
      note: "initial",
      createdByBackofficeUserId: admin.id,
    });
  });

  it("returns a slug error for an invalid or taken slug and writes nothing", async () => {
    const plan = await seedPlan();
    await signInBackoffice("superadmin");
    expect(await createDealer(novakInput(plan.id), { now: NOW })).toMatchObject({ ok: true });
    await drainNotificationsForTest();
    const before = await Promise.all([countOf(dealers), countOf(auditLog), countOf(messageLog), countOf(dealerUsers)]);

    const taken = await createDealer({ ...novakInput(plan.id), ownerEmail: "drugi@novak.si" }, { now: NOW });
    expect(taken).toEqual({ ok: false, field: "slug", error: "taken" });
    const invalid = await createDealer({ ...novakInput(plan.id), slug: "Avto_Novak", ownerEmail: "x@y.si" }, { now: NOW });
    expect(invalid).toEqual({ ok: false, field: "slug", error: "format" });

    await drainNotificationsForTest();
    expect(await Promise.all([countOf(dealers), countOf(auditLog), countOf(messageLog), countOf(dealerUsers)])).toEqual(before);
  });

  it("validates the e-mail, plan and licence date", async () => {
    const plan = await seedPlan();
    await signInBackoffice("superadmin");
    const input = { ...novakInput(plan.id), slug: "kranj" };

    expect(await createDealer({ ...input, ownerEmail: "not-an-email" }, { now: NOW })).toEqual({
      ok: false,
      field: "ownerEmail",
      error: "format",
    });
    expect(await createDealer({ ...input, planId: "00000000-0000-0000-0000-000000000000" }, { now: NOW })).toEqual({
      ok: false,
      field: "planId",
      error: "unknown",
    });
    expect(await createDealer({ ...input, planId: "basic" }, { now: NOW })).toEqual({ ok: false, field: "planId", error: "unknown" });
    expect(await createDealer({ ...input, licenceValidUntil: "2027-02-30" }, { now: NOW })).toEqual({
      ok: false,
      field: "licenceValidUntil",
      error: "format",
    });
    expect(await createDealer({ ...input, licenceValidUntil: "2026-10-20" }, { now: NOW })).toEqual({
      ok: false,
      field: "licenceValidUntil",
      error: "past",
    });
    expect(await createDealer({ ...input, name: "  " }, { now: NOW })).toEqual({ ok: false, field: "name", error: "required" });
    expect(await countOf(dealers)).toBe(0);
    expect(await countOf(auditLog)).toBe(0);

    expect(await createDealer(novakInput(plan.id), { now: NOW })).toMatchObject({ ok: true });
    expect(await createDealer({ ...input, ownerEmail: "OWNER@novak.si" }, { now: NOW })).toEqual({
      ok: false,
      field: "ownerEmail",
      error: "taken",
    });
  });

  it("throws ForbiddenError for Support and writes nothing", async () => {
    const plan = await seedPlan();
    await signInBackoffice("support");

    await expect(createDealer(novakInput(plan.id), { now: NOW })).rejects.toBeInstanceOf(ForbiddenError);
    await drainNotificationsForTest();
    expect(await countOf(dealers)).toBe(0);
    expect(await countOf(auditLog)).toBe(0);
    expect(await countOf(messageLog)).toBe(0);
  });
});

describe("createDealer races", () => {
  // Holds `work` in an open transaction until createDealer blocks on its row locks, then commits it.
  async function raceWith(work: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<void>) {
    let release!: () => void;
    let committed!: Promise<void>;
    afterSlugValidated = () =>
      new Promise<void>((started, failed) => {
        committed = db.transaction(async (tx) => {
          await work(tx);
          started();
          await new Promise<void>((r) => (release = r));
        });
        committed.catch(failed);
      });
    return async () => {
      for (;;) {
        const [{ n }] = (await db.execute(sql`SELECT count(*)::int AS n FROM pg_locks WHERE NOT granted`)).rows as {
          n: number;
        }[];
        if (n > 0) break;
        await new Promise((r) => setTimeout(r, 10));
      }
      release();
      await committed;
    };
  }

  const rivalDealer = (planId: string, slug: string) => ({
    slug,
    name: "Rival",
    legalName: "Rival",
    addressLine: "",
    postalCode: "",
    city: "",
    phone: "",
    email: "rival@rival.si",
    primaryColor: "#000000",
    planId,
  });

  it("maps a slug taken after validation to a slug 'taken' error", async () => {
    const plan = await seedPlan();
    await signInBackoffice("superadmin");
    const commit = await raceWith(async (tx) => {
      await tx.insert(dealers).values(rivalDealer(plan.id, "novak"));
    });

    const [result] = await Promise.all([createDealer(novakInput(plan.id), { now: NOW }), commit()]);
    expect(result).toEqual({ ok: false, field: "slug", error: "taken" });
    await drainNotificationsForTest();
    expect(await countOf(dealers)).toBe(1);
    expect(await countOf(dealerUsers)).toBe(0);
    expect(await countOf(auditLog)).toBe(0);
    expect(await countOf(messageLog)).toBe(0);
  });

  it("maps an owner e-mail taken after validation to an ownerEmail 'taken' error", async () => {
    const plan = await seedPlan();
    await signInBackoffice("superadmin");
    const commit = await raceWith(async (tx) => {
      const [rival] = await tx.insert(dealers).values(rivalDealer(plan.id, "rival")).returning({ id: dealers.id });
      await tx
        .insert(dealerUsers)
        .values({ dealerId: rival.id, email: "owner@novak.si", name: "x", role: "owner", status: "invited" });
    });

    const [result] = await Promise.all([createDealer(novakInput(plan.id), { now: NOW }), commit()]);
    expect(result).toEqual({ ok: false, field: "ownerEmail", error: "taken" });
    await drainNotificationsForTest();
    expect(await countOf(dealers)).toBe(1);
    expect(await countOf(dealerUsers)).toBe(1);
    expect(await countOf(auditLog)).toBe(0);
    expect(await countOf(messageLog)).toBe(0);
  });

  it("rethrows database errors other than the slug and e-mail unique violations", async () => {
    const plan = await seedPlan();
    await signInBackoffice("superadmin");
    const commit = await raceWith(async (tx) => {
      await tx.delete(plans).where(eq(plans.id, plan.id));
    });

    const [result] = await Promise.allSettled([createDealer(novakInput(plan.id), { now: NOW }), commit()]);
    expect(result.status).toBe("rejected");
    expect(await countOf(dealers)).toBe(0);
    expect(await countOf(auditLog)).toBe(0);
  });
});
