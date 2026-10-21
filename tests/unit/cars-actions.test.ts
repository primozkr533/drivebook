// Real-database tests: start Postgres with `docker compose up -d db` (uses TEST_DATABASE_URL).
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { auditLog, cars, dealers, plans } from "@/db/schema";
import { resetConfigForTests } from "@/lib/config";
import { createDealerContext, type DealerContext } from "@/server/data/context";
import { createLocalStorage } from "@/server/storage/local";
import type { FileStorage } from "@/server/storage/types";
import { getTestDb, truncateAll } from "../setup/db";

const session = vi.hoisted(() => ({
  current: null as { id: string; email: string; role: "owner" | "salesperson" } | null,
  ctx: null as DealerContext | null,
}));
const revalidatePath = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {} }),
  headers: async () => new Headers({ "x-drivebook-base-path": "/_dev/app" }),
}));
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
  getDealerContextFromSession: async () =>
    session.current && session.ctx ? { ctx: session.ctx, user: session.current, sessionId: "s" } : null,
}));

let storage: FileStorage;
vi.mock("@/server/storage", () => ({ getStorage: () => storage }));

const { setDbForTests } = await import("@/server/data/db");
const { autofillFromAvtonetAction, saveCarAction, setCarActiveAction } = await import(
  "@/app/dealer-admin/(app)/cars/actions"
);

const db = getTestDb();
const previousAppEnv = process.env.APP_ENV;
const LISTING = "https://www.avto.net/Ads/details.asp?id=123";

const form = (values: Record<string, string | File>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
};

const carForm = (over: Record<string, string | File> = {}) =>
  form({
    id: "",
    make: "Škoda",
    model: "Octavia",
    year: "2020",
    price: "15900",
    avtonetUrl: LISTING,
    imageUrl: "",
    removeImage: "",
    ...over,
  });

const png = async () =>
  new File(
    [
      new Uint8Array(
        await sharp({ create: { width: 40, height: 30, channels: 3, background: { r: 200, g: 80, b: 20 } } })
          .png()
          .toBuffer(),
      ),
    ],
    "car.png",
    { type: "image/png" },
  );

async function redirectOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
  } catch (error) {
    return (error as { url?: string }).url;
  }
  return undefined;
}

async function seedDealer(planId: string, slug: string) {
  const [dealer] = await db
    .insert(dealers)
    .values({
      slug,
      name: slug,
      legalName: slug,
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

let tempDir: string;
let a: Awaited<ReturnType<typeof seedDealer>>;
let b: Awaited<ReturnType<typeof seedDealer>>;

const signIn = (ctx: DealerContext, role: "owner" | "salesperson" = "owner") => {
  session.current = { id: `u-${role}-${ctx.slug}`, email: `${role}@${ctx.slug}.si`, role };
  session.ctx = ctx;
};

const carRow = async (id: string) => (await db.select().from(cars).where(eq(cars.id, id)))[0];
const allCars = async () => (await db.select().from(cars)).map((c) => [c.id, c.model, c.active, c.imageKey]).sort();

async function createdId(over: Record<string, string | File> = {}): Promise<string> {
  const result = await saveCarAction(null, carForm(over));
  if (!result.ok) throw new Error(JSON.stringify(result));
  return result.id;
}

beforeAll(() => {
  process.env.APP_ENV = "test";
  resetConfigForTests();
  setDbForTests(db);
});
beforeEach(async () => {
  tempDir = await mkdtemp(path.join(tmpdir(), "drivebook-cars-actions-"));
  storage = createLocalStorage(tempDir);
  revalidatePath.mockClear();
  await truncateAll();
  const [plan] = await db
    .insert(plans)
    .values({ code: "basic", name: "Basic", maxCars: 20, maxUsers: 5, priceEurCents: 4900 })
    .returning();
  a = await seedDealer(plan.id, "alfa");
  b = await seedDealer(plan.id, "beta");
  signIn(a.ctx);
});
afterEach(async () => {
  vi.unstubAllGlobals();
  await rm(tempDir, { recursive: true, force: true });
});
afterAll(() => {
  setDbForTests(undefined);
  if (previousAppEnv === undefined) delete process.env.APP_ENV;
  else process.env.APP_ENV = previousAppEnv;
  resetConfigForTests();
});

describe.each(["owner", "salesperson"] as const)("saveCarAction as %s", (role) => {
  beforeEach(() => signIn(a.ctx, role));

  it("creates a car from the form keys, maps price to priceEur and revalidates the list", async () => {
    const id = await createdId();
    expect(await carRow(id)).toMatchObject({
      dealerId: a.dealer.id,
      make: "Škoda",
      model: "Octavia",
      year: 2020,
      priceEur: 15900,
      avtoNetUrl: LISTING,
      imageKey: null,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/dealer-admin/cars");
  });

  it("updates the car named by id", async () => {
    const id = await createdId();
    expect(await saveCarAction(null, carForm({ id, model: "Superb", price: "21000", avtonetUrl: "" }))).toEqual({
      ok: true,
      id,
    });
    expect(await carRow(id)).toMatchObject({ model: "Superb", priceEur: 21000, avtoNetUrl: null });
  });
});

describe("saveCarAction validation and images", () => {
  it("returns fieldErrors keyed by form names and the submitted values, creating nothing", async () => {
    const result = await saveCarAction(
      null,
      carForm({ make: " ", model: "", year: "", price: "abc", avtonetUrl: "https://example.com/x" }),
    );
    expect(result).toMatchObject({
      ok: false,
      fieldErrors: { make: "required", model: "required", year: "required" },
      values: { price: "abc", avtonetUrl: "https://example.com/x" },
    });
    const service = await saveCarAction(null, carForm({ year: "1900", price: "-5", avtonetUrl: "https://example.com/x" }));
    expect(service).toMatchObject({
      ok: false,
      fieldErrors: { year: "out_of_range", price: "out_of_range", avtonetUrl: "invalid" },
      values: { make: "Škoda", model: "Octavia", year: "1900" },
    });
    expect(await db.select().from(cars)).toHaveLength(0);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("stores an uploaded file, preferring it over imageUrl", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const id = await createdId({ imageFile: await png(), imageUrl: "https://cdn.example.com/a.jpg" });
    expect((await carRow(id)).imageKey).toMatch(/\.webp$/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("keeps the image when nothing is sent and removes it with removeImage=1", async () => {
    const id = await createdId({ imageFile: await png() });
    const key = (await carRow(id)).imageKey;
    await saveCarAction(null, carForm({ id, imageFile: new File([], "") }));
    expect((await carRow(id)).imageKey).toBe(key);
    await saveCarAction(null, carForm({ id, removeImage: "1" }));
    expect((await carRow(id)).imageKey).toBeNull();
  });

  it("reports an unsupported upload on imageFile and a failed download on imageUrl", async () => {
    const bad = new File([new Uint8Array([1, 2, 3, 4])], "x.png", { type: "image/png" });
    expect(await saveCarAction(null, carForm({ imageFile: bad }))).toMatchObject({
      ok: false,
      fieldErrors: { imageFile: "unsupported_type" },
      values: { make: "Škoda", price: "15900" },
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 500 })));
    expect(await saveCarAction(null, carForm({ imageUrl: "http://93.184.216.34/car.jpg" }))).toMatchObject({
      ok: false,
      fieldErrors: { imageUrl: "download_failed" },
      values: { imageUrl: "http://93.184.216.34/car.jpg", model: "Octavia" },
    });
    expect(await db.select().from(cars)).toHaveLength(0);
  });
});

describe("setCarActiveAction", () => {
  it.each(["owner", "salesperson"] as const)("toggles active as %s and revalidates the list", async (role) => {
    signIn(a.ctx, role);
    const id = await createdId();
    revalidatePath.mockClear();
    await setCarActiveAction(form({ id, active: "0" }));
    expect((await carRow(id)).active).toBe(false);
    await setCarActiveAction(form({ id, active: "1" }));
    expect((await carRow(id)).active).toBe(true);
    expect(revalidatePath).toHaveBeenCalledWith("/dealer-admin/cars");
  });

  it.each([
    ["read_only", "0", "inactive"],
    ["suspended", "1", "all"],
  ] as const)("on a %s dealer redirects to the list with the restricted notice and changes nothing", async (status, active, filter) => {
    const id = await createdId();
    if (active === "1") await setCarActiveAction(form({ id, active: "0" }));
    const before = (await carRow(id)).active;
    await db.update(dealers).set({ status }).where(eq(dealers.id, a.dealer.id));
    revalidatePath.mockClear();
    expect(await redirectOf(setCarActiveAction(form({ id, active, filter })))).toBe(
      `/_dev/app/cars?status=${filter}&notice=readOnly`,
    );
    expect((await carRow(id)).active).toBe(before);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("plan maxCars", () => {
  const setMaxCars = async (maxCars: number) =>
    db.update(plans).set({ maxCars }).where(eq(plans.id, a.dealer.planId));

  it("saveCarAction returns the limit form error and keeps the values", async () => {
    await setMaxCars(1);
    await createdId();
    expect(await saveCarAction(null, carForm({ model: "Second", avtonetUrl: "" }))).toEqual({
      ok: false,
      fieldErrors: {},
      error: "limit",
      values: expect.objectContaining({ model: "Second" }),
    });
    expect(await db.select().from(cars)).toHaveLength(1);
  });

  it("setCarActiveAction redirects to the list with the limit notice and changes nothing", async () => {
    const first = await createdId();
    const second = await createdId({ model: "Second", avtonetUrl: "" });
    await setCarActiveAction(form({ id: second, active: "0" }));
    await setMaxCars(1);
    revalidatePath.mockClear();
    expect(await redirectOf(setCarActiveAction(form({ id: second, active: "1", filter: "inactive" })))).toBe(
      "/_dev/app/cars?status=inactive&notice=limit",
    );
    expect((await carRow(second)).active).toBe(false);
    expect(revalidatePath).not.toHaveBeenCalled();
    await setCarActiveAction(form({ id: first, active: "0" }));
    expect((await carRow(first)).active).toBe(false);
  });
});

describe("cross-dealer ids", () => {
  it.each([
    ["update", (id: string) => saveCarAction(null, carForm({ id, model: "Hijacked" }))],
    ["deactivate", (id: string) => setCarActiveAction(form({ id, active: "0" }))],
    ["unknown id", () => setCarActiveAction(form({ id: "nope", active: "0" }))],
  ])("%s with another dealer's car id is a 404 and changes nothing", async (_name, run) => {
    signIn(b.ctx);
    const foreign = await createdId();
    signIn(a.ctx, "salesperson");
    const before = await allCars();
    const audits = (await db.select().from(auditLog)).length;
    await expect(run(foreign)).rejects.toThrow("NEXT_NOT_FOUND");
    expect(await allCars()).toEqual(before);
    expect(await db.select().from(auditLog)).toHaveLength(audits);
  });
});

describe("no session", () => {
  it("redirects every action to /login and changes nothing", async () => {
    const id = await createdId();
    session.current = null;
    expect(await redirectOf(saveCarAction(null, carForm()))).toBe("/_dev/app/login");
    expect(await redirectOf(setCarActiveAction(form({ id, active: "0" })))).toBe("/_dev/app/login");
    expect(await redirectOf(autofillFromAvtonetAction(LISTING))).toBe("/_dev/app/login");
    expect(await db.select().from(cars)).toHaveLength(1);
    expect((await carRow(id)).active).toBe(true);
  });
});

describe("autofillFromAvtonetAction", () => {
  const html = `<html><head>
    <meta property="og:title" content="Škoda Octavia Combi 2.0 TDI Style">
    <meta property="og:description" content="1.registracija: 2019, 15.900 €">
    <meta property="og:image" content="https://images.avto.net/photo/1.jpg">
  </head><body></body></html>`;

  it.each(["owner", "salesperson"] as const)("maps the parsed listing to form fields as %s", async (role) => {
    signIn(a.ctx, role);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(html, { status: 200 })));
    expect(await autofillFromAvtonetAction(LISTING)).toEqual({
      ok: true,
      fields: {
        make: "Škoda",
        model: "Octavia Combi",
        year: 2019,
        price: 15900,
        imageUrl: "https://images.avto.net/photo/1.jpg",
      },
    });
  });

  it.each([
    ["invalid_url", "https://example.com/x", () => new Response(html)],
    ["blocked", LISTING, () => new Response("", { status: 403 })],
    ["http_error", LISTING, () => new Response("", { status: 500 })],
    ["parse_failed", LISTING, () => new Response("<html><body></body></html>")],
    [
      "http_error",
      LISTING,
      () => {
        throw new TypeError("fetch failed");
      },
    ],
  ])("returns reason %s and never throws", async (reason, url, respond) => {
    vi.stubGlobal("fetch", vi.fn(async () => respond()));
    expect(await autofillFromAvtonetAction(url)).toEqual({ ok: false, reason });
  });

  it("returns reason timeout when the listing does not answer in time", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) =>
            init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))),
          ),
      ),
    );
    try {
      const pending = autofillFromAvtonetAction(LISTING);
      await vi.advanceTimersByTimeAsync(11_000);
      expect(await pending).toEqual({ ok: false, reason: "timeout" });
    } finally {
      vi.useRealTimers();
    }
  });
});
