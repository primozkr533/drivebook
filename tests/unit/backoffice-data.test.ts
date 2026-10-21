// Real-database tests: start Postgres with `docker compose up -d db` (uses TEST_DATABASE_URL).
import { count, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { auditLog, dealerLicenceHistory, dealers, dealerSlugHistory, dealerUsers, plans } from "@/db/schema";
import { RESERVED_SLUGS } from "@/lib/config";
import type { AuthSurface, BackofficeSessionUser, DealerSessionUser } from "@/server/auth/session";
import { getTestDb, truncateAll } from "../setup/db";

const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined) }),
  headers: async () => new Headers(),
}));

class RedirectSignal extends Error {
  constructor(readonly location: string) {
    super(`redirect ${location}`);
  }
}
vi.mock("next/navigation", () => ({
  redirect: (location: string) => {
    throw new RedirectSignal(location);
  },
}));

// Per-surface token stores stand in for the session tables; cookie names come from the real module.
const stores: Record<AuthSurface, Map<string, DealerSessionUser | BackofficeSessionUser>> = {
  dealer: new Map(),
  backoffice: new Map(),
};

vi.mock("@/server/auth/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/auth/session")>();
  return {
    ...actual,
    getCurrentSession: async (surface: AuthSurface) => {
      const token = jar.get(actual.SESSION_COOKIE[surface]);
      const user = token ? stores[surface].get(token) : undefined;
      return user ? { session: { id: "s" }, user } : null;
    },
  };
});

const { SESSION_COOKIE } = await import("@/server/auth/session");
const { ForbiddenError } = await import("@/server/auth/permissions");
const { setDbForTests } = await import("@/server/data/db");
const { withBackofficeMutation } = await import("@/server/data/backoffice/mutate");
const { validateSlug } = await import("@/server/data/backoffice/slug");
const { getDealerDetail, listDealers } = await import("@/server/data/backoffice/dealers");

const db = getTestDb();

const user = { name: "User", status: "active" };
const superadmin: BackofficeSessionUser = { ...user, id: "u-admin", email: "admin@drivebook.si", role: "superadmin" };
const support: BackofficeSessionUser = { ...user, id: "u-support", email: "support@drivebook.si", role: "support" };

function signIn(surface: AuthSurface, u: DealerSessionUser | BackofficeSessionUser): void {
  const token = `tok-${surface}-${u.id}`;
  stores[surface].set(token, u);
  jar.set(SESSION_COOKIE[surface], token);
}

async function seedPlan(code = "basic", name = "Basic") {
  const [plan] = await db
    .insert(plans)
    .values({ code, name, maxCars: 20, maxUsers: 5, monthlySmsQuota: 100, priceEurCents: 4900 })
    .returning();
  return plan;
}

async function seedDealer(planId: string, values: { slug: string; name: string; status?: "active" | "suspended" | "read_only" }) {
  const [dealer] = await db
    .insert(dealers)
    .values({
      legalName: `${values.name} d.o.o.`,
      addressLine: "Dunajska cesta 1",
      postalCode: "1000",
      city: "Ljubljana",
      phone: "+38611234567",
      email: `info@${values.slug}.si`,
      primaryColor: "#E4572E",
      planId,
      ...values,
    })
    .returning();
  return dealer;
}

const auditCount = async () => (await db.select({ n: count() }).from(auditLog))[0].n;

const renameDealer = (dealerId: string, name: string) =>
  withBackofficeMutation(
    async (tx) => {
      const [row] = await tx.update(dealers).set({ name }).where(eq(dealers.id, dealerId)).returning();
      return row;
    },
    { action: "dealer.update", entity: "dealer", entityId: dealerId, dealerId, details: { before: { name: "Old" }, after: { name } } },
  );

beforeAll(() => setDbForTests(db));
beforeEach(async () => {
  await truncateAll();
  jar.clear();
  stores.dealer.clear();
  stores.backoffice.clear();
});
afterAll(async () => {
  setDbForTests(undefined);
  await db.$client.end();
});

describe("withBackofficeMutation", () => {
  it("throws ForbiddenError for Support and writes nothing", async () => {
    const plan = await seedPlan();
    const dealer = await seedDealer(plan.id, { slug: "alpha", name: "Old" });
    signIn("backoffice", support);

    await expect(renameDealer(dealer.id, "New")).rejects.toBeInstanceOf(ForbiddenError);
    const [row] = await db.select().from(dealers).where(eq(dealers.id, dealer.id));
    expect(row.name).toBe("Old");
    expect(await auditCount()).toBe(0);
  });

  it("commits fn and the audit_log row together for a Superadmin", async () => {
    const plan = await seedPlan();
    const dealer = await seedDealer(plan.id, { slug: "alpha", name: "Old" });
    signIn("backoffice", superadmin);

    const updated = await renameDealer(dealer.id, "New");
    expect(updated.name).toBe("New");
    const entries = await db.select().from(auditLog);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      dealerId: dealer.id,
      actorKind: "backoffice_user",
      actorId: superadmin.id,
      action: "dealer.update",
      entity: "dealer",
      entityId: dealer.id,
      data: { before: { name: "Old" }, after: { name: "New" } },
    });
  });

  it("rolls back fn and the audit row when fn throws", async () => {
    const plan = await seedPlan();
    const dealer = await seedDealer(plan.id, { slug: "alpha", name: "Old" });
    signIn("backoffice", superadmin);

    await expect(
      withBackofficeMutation(
        async (tx) => {
          await tx.update(dealers).set({ name: "New" }).where(eq(dealers.id, dealer.id));
          throw new Error("boom");
        },
        { action: "dealer.update", entity: "dealer", dealerId: dealer.id },
      ),
    ).rejects.toThrow("boom");
    const [row] = await db.select().from(dealers).where(eq(dealers.id, dealer.id));
    expect(row.name).toBe("Old");
    expect(await auditCount()).toBe(0);
  });

  it("succeeds against a suspended dealer", async () => {
    const plan = await seedPlan();
    const dealer = await seedDealer(plan.id, { slug: "alpha", name: "Old", status: "suspended" });
    signIn("backoffice", superadmin);

    await withBackofficeMutation(
      (tx) => tx.update(dealers).set({ status: "active" }).where(eq(dealers.id, dealer.id)),
      { action: "dealer.reactivate", entity: "dealer", dealerId: dealer.id, details: { before: "suspended", after: "active" } },
    );
    const [row] = await db.select().from(dealers).where(eq(dealers.id, dealer.id));
    expect(row.status).toBe("active");
    expect(await auditCount()).toBe(1);
  });

  it("builds the audit entry from fn's result and allows no dealer", async () => {
    signIn("backoffice", superadmin);
    const plan = await withBackofficeMutation(
      async (tx) => (await tx.insert(plans).values({ code: "pro", name: "Pro", maxCars: 50, maxUsers: 10, priceEurCents: 9900 }).returning())[0],
      (p) => ({ action: "plan.create", entity: "plan", entityId: p.id, details: { after: { code: p.code } } }),
    );
    const [entry] = await db.select().from(auditLog);
    expect(entry).toMatchObject({ dealerId: null, entityId: plan.id, data: { after: { code: "pro" } } });
  });
});

describe("validateSlug", () => {
  it("rejects bad slugs with the matching error code and accepts 'novak'", async () => {
    const plan = await seedPlan();
    const other = await seedDealer(plan.id, { slug: "alpha", name: "Alpha" });
    await db.insert(dealerSlugHistory).values({ dealerId: other.id, slug: "alpha-old" });

    expect(await validateSlug("Ab")).toEqual({ ok: false, error: "format" });
    expect(await validateSlug("ab")).toEqual({ ok: false, error: "length" });
    expect(await validateSlug("a_b")).toEqual({ ok: false, error: "format" });
    expect(await validateSlug("a".repeat(41))).toEqual({ ok: false, error: "length" });
    expect(await validateSlug("a".repeat(40))).toEqual({ ok: true });
    expect(await validateSlug(RESERVED_SLUGS[0])).toEqual({ ok: false, error: "reserved" });
    expect(await validateSlug("alpha")).toEqual({ ok: false, error: "taken" });
    expect(await validateSlug("alpha-old")).toEqual({ ok: false, error: "taken" });
    expect(await validateSlug("novak")).toEqual({ ok: true });
  });

  it("ignores the excluded dealer's own current slug but not another dealer's", async () => {
    const plan = await seedPlan();
    const alpha = await seedDealer(plan.id, { slug: "alpha", name: "Alpha" });
    const beta = await seedDealer(plan.id, { slug: "beta", name: "Beta" });

    expect(await validateSlug("alpha", { excludeDealerId: alpha.id })).toEqual({ ok: true });
    expect(await validateSlug("alpha", { excludeDealerId: beta.id })).toEqual({ ok: false, error: "taken" });
  });
});

describe("backoffice dealer reads", () => {
  async function seedList() {
    const basic = await seedPlan();
    const pro = await seedPlan("pro", "Pro");
    const novak = await seedDealer(basic.id, { slug: "novak", name: "Avto Novak" });
    const kranj = await seedDealer(pro.id, { slug: "kranj-cars", name: "Bela Kranj", status: "suspended" });
    const zeta = await seedDealer(basic.id, { slug: "zeta", name: "Zeta Motors" });
    return { basic, pro, novak, kranj, zeta };
  }

  it("lists dealers sorted by name with id and plan name", async () => {
    const { novak, kranj, zeta } = await seedList();
    signIn("backoffice", support);

    const list = await listDealers();
    expect(list.map((d) => d.id)).toEqual([novak.id, kranj.id, zeta.id]);
    expect(list[1]).toEqual({
      id: kranj.id,
      name: "Bela Kranj",
      slug: "kranj-cars",
      status: "suspended",
      licenceValidUntil: null,
      planName: "Pro",
    });
  });

  it("filters by status and by a case-insensitive q on name or slug", async () => {
    const { novak, kranj, zeta } = await seedList();
    signIn("backoffice", superadmin);

    expect((await listDealers({ status: "suspended" })).map((d) => d.id)).toEqual([kranj.id]);
    expect((await listDealers({ q: "NOVAK" })).map((d) => d.id)).toEqual([novak.id]);
    expect((await listDealers({ q: "Kranj-C" })).map((d) => d.id)).toEqual([kranj.id]);
    expect((await listDealers({ q: "motors", status: "active" })).map((d) => d.id)).toEqual([zeta.id]);
    expect(await listDealers({ q: "motors", status: "suspended" })).toEqual([]);
    expect(await listDealers({ q: "%" })).toEqual([]);
  });

  it("getDealerDetail returns fields, plan, slug history, owner and licence history newest first", async () => {
    const { basic, pro, novak } = await seedList();
    await db.insert(dealerSlugHistory).values({ dealerId: novak.id, slug: "novak-old" });
    await db.insert(dealerUsers).values({ dealerId: novak.id, email: "owner@novak.si", name: "Owner", role: "owner" });
    await db.insert(dealerLicenceHistory).values([
      {
        dealerId: novak.id,
        planId: basic.id,
        validFrom: new Date("2025-01-01T00:00:00Z"),
        validTo: new Date("2026-01-01T00:00:00Z"),
        validUntil: "2025-12-31",
        note: "first",
      },
      {
        dealerId: novak.id,
        planId: pro.id,
        validFrom: new Date("2026-01-01T00:00:00Z"),
        previousValidUntil: "2025-12-31",
        validUntil: "2026-12-31",
        note: "second",
      },
    ]);
    signIn("backoffice", support);

    const detail = await getDealerDetail(novak.id);
    expect(detail).toMatchObject({
      id: novak.id,
      slug: "novak",
      name: "Avto Novak",
      legalName: "Avto Novak d.o.o.",
      status: "active",
      dpaSigned: false,
      plan: { id: basic.id, code: "basic", name: "Basic" },
      slugHistory: [{ slug: "novak-old" }],
      owner: { email: "owner@novak.si", status: "invited" },
    });
    expect(detail!.licenceHistory.map((h) => [h.note, h.planName])).toEqual([
      ["second", "Pro"],
      ["first", "Basic"],
    ]);
  });

  it("getDealerDetail returns null for an unknown or malformed id", async () => {
    signIn("backoffice", support);
    expect(await getDealerDetail("00000000-0000-0000-0000-000000000000")).toBeNull();
    expect(await getDealerDetail("not-a-uuid")).toBeNull();
  });

  it("throws without a backoffice session or with only a dealer session", async () => {
    const { novak } = await seedList();
    await expect(listDealers()).rejects.toBeInstanceOf(RedirectSignal);
    await expect(getDealerDetail(novak.id)).rejects.toBeInstanceOf(RedirectSignal);

    signIn("dealer", { ...user, id: "u-owner", email: "owner@novak.si", role: "owner", dealerId: novak.id });
    await expect(listDealers()).rejects.toBeInstanceOf(RedirectSignal);
    await expect(getDealerDetail(novak.id)).rejects.toBeInstanceOf(RedirectSignal);
  });
});
