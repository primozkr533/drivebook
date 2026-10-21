// Real-database tests: start Postgres with `docker compose up -d db` (uses TEST_DATABASE_URL).
import { asc, count, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  auditLog,
  authTokens,
  backofficeUsers,
  dealerLicenceHistory,
  dealers,
  dealerSlugHistory,
  dealerUsers,
  messageLog,
  plans,
} from "@/db/schema";
import { resetConfigForTests } from "@/lib/config";
import type { BackofficeSessionUser } from "@/server/auth/session";
import { buildDealerPageModel } from "@/app/site/[slug]/model";
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

const { SESSION_COOKIE } = await import("@/server/auth/session");
const { ForbiddenError } = await import("@/server/auth/permissions");
const { setDbForTests } = await import("@/server/data/db");
const { resolveDealerSlug } = await import("@/server/data/dealers");
const { routeRequest } = await import("@/server/routing");
const {
  changeDealerSlug,
  createDealer,
  extendLicence,
  recordDpaSigned,
  resendOwnerInvitation,
  setDealerStatus,
  updateDealer,
} = await import("@/server/data/backoffice/dealers");
const { drainNotificationsForTest, stopBossForTests } = await import("@/server/notify/queue");

const db = getTestDb();
const previousAppEnv = process.env.APP_ENV;
const CREATED = new Date("2026-10-01T10:00:00Z");
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

async function seedPlan(code = "basic", name = "Basic") {
  const [plan] = await db
    .insert(plans)
    .values({ code, name, maxCars: 20, maxUsers: 5, monthlySmsQuota: 100, priceEurCents: 4900 })
    .returning();
  return plan;
}

async function seedNovak() {
  const plan = await seedPlan();
  const admin = await signInBackoffice("superadmin");
  const created = await createDealer(
    { name: "Avto Novak", slug: "novak", ownerEmail: "owner@novak.si", planId: plan.id, licenceValidUntil: "2027-10-31" },
    { now: CREATED },
  );
  if (!created.ok) throw new Error("seed failed");
  await drainNotificationsForTest();
  await db.delete(auditLog);
  await db.delete(messageLog);
  return { plan, admin, id: created.id };
}

const dealerRow = async (id: string) => (await db.select().from(dealers).where(eq(dealers.id, id)))[0];
const audits = () => db.select().from(auditLog);
const countOf = async (table: typeof auditLog | typeof dealerLicenceHistory | typeof messageLog) =>
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

describe("updateDealer", () => {
  it("updates name, plan and notes and records the old and new plan", async () => {
    const { plan, admin, id } = await seedNovak();
    const pro = await seedPlan("pro", "Pro");

    expect(await updateDealer(id, { name: " Avto Novak d.o.o. ", planId: pro.id, notes: " VIP " })).toEqual({ ok: true });
    expect(await dealerRow(id)).toMatchObject({ name: "Avto Novak d.o.o.", planId: pro.id, notes: "VIP" });

    const [audit] = await audits();
    expect(audit).toMatchObject({ action: "dealer.update", entityId: id, dealerId: id, actorId: admin.id });
    expect(audit.data).toMatchObject({ before: { planId: plan.id, name: "Avto Novak" }, after: { planId: pro.id } });
  });

  it("rejects a blank name or unknown plan without writing", async () => {
    const { plan, id } = await seedNovak();
    expect(await updateDealer(id, { name: " ", planId: plan.id })).toEqual({ ok: false, field: "name", error: "required" });
    expect(await updateDealer(id, { name: "X", planId: "basic" })).toEqual({ ok: false, field: "planId", error: "unknown" });
    expect(await updateDealer("nope", { name: "X", planId: plan.id })).toEqual({ ok: false, error: "notFound" });
    expect(await countOf(auditLog)).toBe(0);
    expect((await dealerRow(id)).name).toBe("Avto Novak");
  });
});

describe("changeDealerSlug", () => {
  it("moves the old slug into history so routing resolves it as a rename", async () => {
    const { id } = await seedNovak();

    expect(await changeDealerSlug(id, "avto-novak")).toEqual({ ok: true });
    expect((await dealerRow(id)).slug).toBe("avto-novak");
    expect(await db.select({ slug: dealerSlugHistory.slug }).from(dealerSlugHistory)).toEqual([{ slug: "novak" }]);

    expect(await resolveDealerSlug("novak")).toEqual({ kind: "renamed", slug: "avto-novak" });
    expect((await resolveDealerSlug("avto-novak")).kind).toBe("current");
    const cfg = { baseDomain: "drivebook.localhost", devAliases: false, resolveSlug: resolveDealerSlug, protocol: "https:" };
    expect(await routeRequest("novak.drivebook.localhost", "/zasebnost", "?car=1", cfg)).toEqual({
      kind: "redirect",
      status: 301,
      location: "https://avto-novak.drivebook.localhost/zasebnost?car=1",
    });

    const [audit] = await audits();
    expect(audit).toMatchObject({ action: "dealer.slug_change", entityId: id });
    expect(audit.data).toEqual({ before: { slug: "novak" }, after: { slug: "avto-novak" } });
  });

  it("removes the history row when the dealer takes back an old slug", async () => {
    const { id } = await seedNovak();
    await changeDealerSlug(id, "avto-novak");

    expect(await changeDealerSlug(id, "novak")).toEqual({ ok: true });
    expect(await db.select({ slug: dealerSlugHistory.slug }).from(dealerSlugHistory)).toEqual([{ slug: "avto-novak" }]);
    expect((await resolveDealerSlug("novak")).kind).toBe("current");
    expect(await resolveDealerSlug("avto-novak")).toEqual({ kind: "renamed", slug: "novak" });
  });

  it("returns slug errors for invalid, reserved and taken values", async () => {
    const { plan, id } = await seedNovak();
    const other = await createDealer(
      { name: "Kranj", slug: "kranj", ownerEmail: "o@kranj.si", planId: plan.id, licenceValidUntil: "2027-10-31" },
      { now: CREATED },
    );
    if (!other.ok) throw new Error("seed failed");
    await changeDealerSlug(other.id, "kranj-avto");
    await db.delete(auditLog);

    expect(await changeDealerSlug(id, "Novak_2")).toEqual({ ok: false, field: "slug", error: "format" });
    expect(await changeDealerSlug(id, "ab")).toEqual({ ok: false, field: "slug", error: "length" });
    expect(await changeDealerSlug(id, "admin")).toEqual({ ok: false, field: "slug", error: "reserved" });
    expect(await changeDealerSlug(id, "kranj-avto")).toEqual({ ok: false, field: "slug", error: "taken" });
    expect(await changeDealerSlug(id, "kranj")).toEqual({ ok: false, field: "slug", error: "taken" });
    expect((await dealerRow(id)).slug).toBe("novak");
    expect(await countOf(auditLog)).toBe(0);
  });
});

describe("setDealerStatus", () => {
  it("suspending switches the public page to the call-us state; reactivating restores it", async () => {
    const { id } = await seedNovak();
    const pageModel = async () => {
      const resolved = await resolveDealerSlug("novak");
      if (resolved.kind !== "current") throw new Error("not resolved");
      return buildDealerPageModel({
        dealer: resolved.dealer,
        cars: [],
        hours: [],
        now: { dateISO: "2026-10-21", isoWeekday: 3, minutes: 600 } as never,
        carParam: undefined,
        basePath: "",
      });
    };

    expect(await setDealerStatus(id, "suspended")).toEqual({ ok: true });
    expect((await dealerRow(id)).status).toBe("suspended");
    expect((await pageModel()).suspended).toBe(true);

    expect(await setDealerStatus(id, "active")).toEqual({ ok: true });
    expect((await pageModel()).suspended).toBe(false);

    const rows = await db.select().from(auditLog).orderBy(asc(auditLog.createdAt), asc(auditLog.id));
    expect(rows.map((r) => r.action).sort()).toEqual(["dealer.reactivate", "dealer.suspend"]);
  });
});

describe("extendLicence", () => {
  it("appends a history row with the previous and new valid-until and the note", async () => {
    const { plan, admin, id } = await seedNovak();

    expect(await extendLicence(id, { validUntil: "2028-10-31", note: " Plačano za 2028 " }, { now: NOW })).toEqual({ ok: true });
    expect((await dealerRow(id)).licenceValidUntil).toBe("2028-10-31");

    const history = await db
      .select()
      .from(dealerLicenceHistory)
      .where(eq(dealerLicenceHistory.dealerId, id))
      .orderBy(asc(dealerLicenceHistory.validFrom));
    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({ note: "initial", validTo: NOW });
    expect(history[1]).toMatchObject({
      planId: plan.id,
      previousValidUntil: "2027-10-31",
      validUntil: "2028-10-31",
      note: "Plačano za 2028",
      validFrom: NOW,
      validTo: null,
      createdByBackofficeUserId: admin.id,
    });

    const [audit] = await audits();
    expect(audit).toMatchObject({ action: "dealer.licence_extend", entityId: id, actorId: admin.id });
  });

  it("rejects a missing note or an invalid date", async () => {
    const { id } = await seedNovak();
    const before = await countOf(dealerLicenceHistory);

    expect(await extendLicence(id, { validUntil: "2028-10-31", note: "  " }, { now: NOW })).toEqual({
      ok: false,
      field: "note",
      error: "required",
    });
    expect(await extendLicence(id, { validUntil: "2028-02-30", note: "x" }, { now: NOW })).toEqual({
      ok: false,
      field: "validUntil",
      error: "format",
    });
    expect(await extendLicence(id, { validUntil: "31.10.2028", note: "x" }, { now: NOW })).toEqual({
      ok: false,
      field: "validUntil",
      error: "format",
    });
    expect(await countOf(dealerLicenceHistory)).toBe(before);
    expect(await countOf(auditLog)).toBe(0);
    expect((await dealerRow(id)).licenceValidUntil).toBe("2027-10-31");
  });
});

describe("recordDpaSigned", () => {
  it("marks the DPA signed on the given date", async () => {
    const { id } = await seedNovak();

    expect(await recordDpaSigned(id, { signedAt: "2026-10-20" })).toEqual({ ok: true });
    expect(await dealerRow(id)).toMatchObject({ dpaSigned: true, dpaSignedAt: "2026-10-20" });
    expect((await audits())[0]).toMatchObject({ action: "dealer.dpa_signed", entityId: id });

    expect(await recordDpaSigned(id, { signedAt: "yesterday" })).toEqual({ ok: false, field: "signedAt", error: "format" });
  });
});

describe("resendOwnerInvitation", () => {
  it("re-issues the 7-day link and queues the invitation e-mail", async () => {
    const { id } = await seedNovak();

    expect(await resendOwnerInvitation(id, { now: NOW })).toEqual({ ok: true });

    const [owner] = await db.select().from(dealerUsers).where(eq(dealerUsers.dealerId, id));
    const tokens = await db.select().from(authTokens).where(eq(authTokens.userId, owner.id)).orderBy(asc(authTokens.createdAt));
    expect(tokens).toHaveLength(2);
    expect(tokens[0].usedAt).not.toBeNull();
    expect(tokens[1]).toMatchObject({ purpose: "invite", usedAt: null });
    expect(tokens[1].expiresAt.getTime() - NOW.getTime()).toBe(7 * 24 * 60 * 60 * 1000);

    await drainNotificationsForTest();
    const logs = await db.select().from(messageLog);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ recipient: "owner@novak.si", template: "invitation", dealerId: id });
    expect((await audits())[0]).toMatchObject({ action: "dealer.invite_resend", entityId: id });
  });

  it("is subject to the per-account link cap", async () => {
    const { id } = await seedNovak();
    expect(await resendOwnerInvitation(id, { now: NOW })).toEqual({ ok: true });
    expect(await resendOwnerInvitation(id, { now: NOW })).toEqual({ ok: true });
    expect(await resendOwnerInvitation(id, { now: NOW })).toEqual({ ok: true });
    expect(await resendOwnerInvitation(id, { now: NOW })).toEqual({ ok: false, error: "rateLimited" });
    expect(await countOf(auditLog)).toBe(3);
  });

  it("returns notInvited once the owner is active", async () => {
    const { id } = await seedNovak();
    await db.update(dealerUsers).set({ status: "active" }).where(eq(dealerUsers.dealerId, id));

    expect(await resendOwnerInvitation(id, { now: NOW })).toEqual({ ok: false, error: "notInvited" });
    await drainNotificationsForTest();
    expect(await countOf(messageLog)).toBe(0);
    expect(await countOf(auditLog)).toBe(0);
  });
});

describe("Support", () => {
  it("gets ForbiddenError from every action and nothing is written", async () => {
    const { plan, id } = await seedNovak();
    await signInBackoffice("support");

    const calls = [
      () => updateDealer(id, { name: "X", planId: plan.id }),
      () => changeDealerSlug(id, "avto-novak"),
      () => setDealerStatus(id, "suspended"),
      () => extendLicence(id, { validUntil: "2028-10-31", note: "x" }, { now: NOW }),
      () => recordDpaSigned(id, { signedAt: "2026-10-20" }),
      () => resendOwnerInvitation(id, { now: NOW }),
    ];
    for (const call of calls) await expect(call()).rejects.toBeInstanceOf(ForbiddenError);

    await drainNotificationsForTest();
    expect(await countOf(auditLog)).toBe(0);
    expect(await countOf(messageLog)).toBe(0);
    expect(await dealerRow(id)).toMatchObject({ name: "Avto Novak", slug: "novak", status: "active", dpaSigned: false });
  });
});
