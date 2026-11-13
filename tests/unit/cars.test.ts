// Real-database tests: start Postgres with `docker compose up -d db` (uses TEST_DATABASE_URL).
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { auditLog, cars, dealers, plans } from "@/db/schema";
import { ljubljanaNow } from "@/lib/date";
import { createDealerContext, type DealerContext } from "@/server/data/context";
import type { DealerSession } from "@/server/auth/session";
import { createLocalStorage } from "@/server/storage/local";
import type { FileStorage } from "@/server/storage/types";
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

let storage: FileStorage;
vi.mock("@/server/storage", () => ({ getStorage: () => storage }));

const { DealerReadOnlyError, ForbiddenError } = await import("@/server/auth/permissions");
const { setDbForTests } = await import("@/server/data/db");
const {
  CarLimitError,
  CarNotFoundError,
  createCar,
  getCar,
  getCarForAdmin,
  listActiveCars,
  listCarsForAdmin,
  setCarActive,
  updateCar,
} = await import("@/server/data/cars");

const db = getTestDb();
const thisYear = Number(ljubljanaNow().dateISO.slice(0, 4));

const png = (r = 200) =>
  sharp({ create: { width: 40, height: 30, channels: 3, background: { r, g: 80, b: 20 } } })
    .png()
    .toBuffer();

const input = (over: Record<string, unknown> = {}) => ({
  make: "  Škoda ",
  model: "Octavia",
  year: 2020,
  priceEur: 15900,
  avtonetUrl: "https://www.avto.net/Ads/details.asp?id=123",
  ...over,
});

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

function signIn(ctx: DealerContext, role: "owner" | "salesperson" = "owner"): void {
  session = {
    ctx,
    user: { id: `u-${role}-${ctx.slug}`, email: `${role}@${ctx.slug}.si`, role },
    sessionId: "s",
  };
}

const carRow = async (id: string) => (await db.select().from(cars).where(eq(cars.id, id)))[0];
const audits = () => db.select().from(auditLog);

let tempDir: string;
let a: Awaited<ReturnType<typeof seedDealer>>;
let b: Awaited<ReturnType<typeof seedDealer>>;

async function storedFiles(): Promise<string[]> {
  const entries = await readdir(tempDir, { recursive: true, withFileTypes: true }).catch(() => []);
  return entries
    .filter((e) => e.isFile() && !e.name.endsWith(".meta.json"))
    .map((e) => path.relative(tempDir, path.join(e.parentPath, e.name)).split(path.sep).join("/"));
}

async function created(ctx: DealerContext, over: Record<string, unknown> = {}) {
  const result = await createCar(ctx, input(over));
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.car;
}

beforeAll(() => setDbForTests(db));
beforeEach(async () => {
  tempDir = await mkdtemp(path.join(tmpdir(), "drivebook-cars-"));
  storage = createLocalStorage(tempDir);
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
afterEach(async () => {
  vi.unstubAllGlobals();
  await rm(tempDir, { recursive: true, force: true });
});
afterAll(async () => {
  setDbForTests(undefined);
  await db.$client.end();
});

describe.each(["owner", "salesperson"] as const)("as %s", (role) => {
  beforeEach(() => signIn(a.ctx, role));

  it("creates a car with trimmed fields and audits car.create", async () => {
    const result = await createCar(a.ctx, input());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.car).toMatchObject({ make: "Škoda", model: "Octavia", year: 2020, priceEur: 15900, active: true });
    expect(result.car.id).toMatch(/^[0-9A-Za-z]{16}$/);
    expect(await carRow(result.car.id)).toMatchObject({ dealerId: a.dealer.id, imageKey: null });
    const [entry] = await audits();
    expect(entry).toMatchObject({
      action: "car.create",
      entity: "car",
      entityId: result.car.id,
      dealerId: a.dealer.id,
      actorKind: "dealer_user",
      actorId: `u-${role}-alpha`,
    });
  });

  it("updates a car and audits car.update with before/after", async () => {
    const car = await created(a.ctx);
    const result = await updateCar(a.ctx, car.id, input({ model: "Superb", priceEur: 20000, avtonetUrl: "" }));
    expect(result).toMatchObject({ ok: true, car: { model: "Superb", priceEur: 20000 } });
    expect(await carRow(car.id)).toMatchObject({ model: "Superb", priceEur: 20000, avtoNetUrl: null });
    const entry = (await audits()).find((e) => e.action === "car.update");
    expect(entry).toMatchObject({ entityId: car.id, actorId: `u-${role}-alpha` });
    expect(entry?.data).toMatchObject({ before: { model: "Octavia" }, after: { model: "Superb" } });
  });

  it("deactivates and reactivates a car with audit rows", async () => {
    const car = await created(a.ctx);
    expect(await setCarActive(a.ctx, car.id, false)).toMatchObject({ id: car.id, active: false });
    expect((await carRow(car.id)).active).toBe(false);
    expect(await setCarActive(a.ctx, car.id, true)).toMatchObject({ id: car.id, active: true });
    expect((await carRow(car.id)).active).toBe(true);
    const actions = (await audits()).map((e) => [e.action, e.entityId, e.actorId]);
    expect(actions).toEqual(
      expect.arrayContaining([
        ["car.deactivate", car.id, `u-${role}-alpha`],
        ["car.reactivate", car.id, `u-${role}-alpha`],
      ]),
    );
  });
});

describe("listCarsForAdmin / getCarForAdmin", () => {
  it("lists newest first and filters by status, only for the context dealer", async () => {
    const first = await created(a.ctx, { model: "One", avtonetUrl: "" });
    const second = await created(a.ctx, { model: "Two", avtonetUrl: "" });
    await db.update(cars).set({ createdAt: new Date("2026-01-01T00:00:00Z") }).where(eq(cars.id, first.id));
    const third = await created(a.ctx, { model: "Three", avtonetUrl: "" });
    await setCarActive(a.ctx, second.id, false);
    signIn(b.ctx);
    await created(b.ctx, { model: "Foreign" });
    signIn(a.ctx, "salesperson");

    const ids = (cs: { id: string }[]) => cs.map((c) => c.id);
    expect(ids(await listCarsForAdmin(a.ctx, { status: "all" }))).toEqual([third.id, second.id, first.id]);
    expect(ids(await listCarsForAdmin(a.ctx, { status: "active" }))).toEqual([third.id, first.id]);
    expect(ids(await listCarsForAdmin(a.ctx, { status: "inactive" }))).toEqual([second.id]);
    expect(await getCarForAdmin(a.ctx, second.id)).toMatchObject({ id: second.id, active: false });
    expect(await getCarForAdmin(a.ctx, "nope")).toBeNull();
  });

  it("refuses a user of another dealer", async () => {
    signIn(b.ctx);
    await expect(listCarsForAdmin(a.ctx, { status: "all" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(createCar(a.ctx, input())).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("cross-dealer ids", () => {
  it("behave as not found and change nothing", async () => {
    signIn(b.ctx);
    const foreign = await created(b.ctx);
    signIn(a.ctx);
    const before = await carRow(foreign.id);
    const auditCount = (await audits()).length;

    expect(await getCarForAdmin(a.ctx, foreign.id)).toBeNull();
    await expect(updateCar(a.ctx, foreign.id, input({ model: "Hacked" }))).rejects.toBeInstanceOf(CarNotFoundError);
    await expect(setCarActive(a.ctx, foreign.id, false)).rejects.toBeInstanceOf(CarNotFoundError);
    expect(await getCar(a.ctx, foreign.id)).toBeNull();

    expect(await carRow(foreign.id)).toEqual(before);
    expect(await audits()).toHaveLength(auditCount);
    expect(await storedFiles()).toEqual([]);
  });

  it("does not store an image for an unknown car", async () => {
    await expect(updateCar(a.ctx, "unknown", input({ image: { kind: "upload", bytes: await png() } }))).rejects.toBeInstanceOf(
      CarNotFoundError,
    );
    expect(await storedFiles()).toEqual([]);
  });
});

describe("validation", () => {
  it.each([
    [{ year: 1949 }, { year: "out_of_range" }],
    [{ year: thisYear + 2 }, { year: "out_of_range" }],
    [{ year: 2020.5 }, { year: "invalid" }],
    [{ priceEur: -1 }, { priceEur: "out_of_range" }],
    [{ priceEur: 10_000_001 }, { priceEur: "out_of_range" }],
    [{ priceEur: 99.5 }, { priceEur: "invalid" }],
    [{ avtonetUrl: "https://www.example.com/car/1" }, { avtonetUrl: "invalid" }],
    [{ make: "   " }, { make: "required" }],
    [{ model: "x".repeat(61) }, { model: "too_long" }],
  ])("rejects %j", async (over, errors) => {
    expect(await createCar(a.ctx, input(over))).toEqual({ ok: false, errors });
    expect(await db.select().from(cars)).toHaveLength(0);
    expect(await audits()).toHaveLength(0);
  });

  it("accepts the boundaries", async () => {
    expect((await createCar(a.ctx, input({ year: 1950, priceEur: 0, avtonetUrl: "" }))).ok).toBe(true);
    expect(
      (await createCar(a.ctx, input({ year: thisYear + 1, priceEur: 10_000_000, model: "x".repeat(60), avtonetUrl: undefined })))
        .ok,
    ).toBe(true);
  });

  it("reports several field errors at once on update without changing the car", async () => {
    const car = await created(a.ctx);
    expect(await updateCar(a.ctx, car.id, input({ year: 1949, priceEur: -5, avtonetUrl: "ftp://avto.net/x" }))).toEqual({
      ok: false,
      errors: { year: "out_of_range", priceEur: "out_of_range", avtonetUrl: "invalid" },
    });
    expect((await carRow(car.id)).year).toBe(2020);
  });

  it("reports a duplicate avto.net URL and removes the newly stored image", async () => {
    await created(a.ctx);
    expect(await createCar(a.ctx, input({ image: { kind: "upload", bytes: await png() } }))).toEqual({
      ok: false,
      errors: { avtonetUrl: "taken" },
    });
    expect(await storedFiles()).toEqual([]);
  });

  it("reports image errors on the image field", async () => {
    expect(await createCar(a.ctx, input({ image: { kind: "upload", bytes: Buffer.from("not an image") } }))).toEqual({
      ok: false,
      errors: { image: "unsupported_type" },
    });
    expect(await db.select().from(cars)).toHaveLength(0);
  });
});

describe("plan maxCars", () => {
  const setMaxCars = async (maxCars: number) =>
    db.update(plans).set({ maxCars }).where(eq(plans.id, a.dealer.planId));

  it("refuses a second active car at maxCars=1 and allows it after deactivating the first", async () => {
    await setMaxCars(1);
    const first = await created(a.ctx);
    const auditCount = (await audits()).length;

    await expect(createCar(a.ctx, input({ model: "Second", avtonetUrl: "" }))).rejects.toBeInstanceOf(CarLimitError);
    expect(await db.select().from(cars)).toHaveLength(1);
    expect(await audits()).toHaveLength(auditCount);

    await setCarActive(a.ctx, first.id, false);
    expect((await createCar(a.ctx, input({ model: "Second", avtonetUrl: "" }))).ok).toBe(true);
  });

  it("refuses reactivating over the limit but never refuses deactivation or an inactive create", async () => {
    await setMaxCars(1);
    const first = await created(a.ctx);
    const inactive = await created(a.ctx, { model: "Parked", avtonetUrl: "", active: false });
    expect(inactive.active).toBe(false);

    await expect(setCarActive(a.ctx, inactive.id, true)).rejects.toBeInstanceOf(CarLimitError);
    expect((await carRow(inactive.id)).active).toBe(false);
    expect(await setCarActive(a.ctx, first.id, true)).toMatchObject({ active: true });

    await setMaxCars(0);
    expect(await setCarActive(a.ctx, first.id, false)).toMatchObject({ active: false });
    expect(await setCarActive(a.ctx, first.id, false)).toMatchObject({ active: false });
  });

  it("removes the stored image when the create is refused", async () => {
    await setMaxCars(0);
    await expect(createCar(a.ctx, input({ image: { kind: "upload", bytes: await png() } }))).rejects.toBeInstanceOf(
      CarLimitError,
    );
    expect(await storedFiles()).toEqual([]);
  });

  it("does not count another dealer's cars", async () => {
    await setMaxCars(1);
    signIn(b.ctx);
    await created(b.ctx);
    signIn(a.ctx);
    expect((await createCar(a.ctx, input())).ok).toBe(true);
    signIn(b.ctx);
    await expect(createCar(b.ctx, input({ model: "Second", avtonetUrl: "" }))).rejects.toBeInstanceOf(CarLimitError);
  });
});

describe("public visibility", () => {
  it("hides a deactivated car from the public list and by-id lookup until reactivated", async () => {
    const car = await created(a.ctx);
    const other = await created(a.ctx, { avtonetUrl: "" });
    const publicIds = async () => (await listActiveCars(a.ctx)).map((c) => c.id);

    await setCarActive(a.ctx, car.id, false);
    expect(await publicIds()).toEqual([other.id]);
    expect(await getCar(a.ctx, car.id)).toBeNull();

    await setCarActive(a.ctx, car.id, true);
    expect((await publicIds()).sort()).toEqual([car.id, other.id].sort());
    expect(await getCar(a.ctx, car.id)).toMatchObject({ id: car.id });
  });
});

describe("images", () => {
  it("stores an uploaded image and exposes its URL", async () => {
    const car = await created(a.ctx, { image: { kind: "upload", bytes: await png() } });
    const key = (await carRow(car.id)).imageKey!;
    expect(key).toMatch(/^cars\/[0-9A-Za-z]+\.webp$/);
    expect(await storedFiles()).toEqual([key]);
    expect(car.imageUrl).toBe(storage.url(key));
  });

  it("deletes the old file after replacing the image, and keeps it on 'keep'", async () => {
    const car = await created(a.ctx, { image: { kind: "upload", bytes: await png() } });
    const oldKey = (await carRow(car.id)).imageKey!;

    expect((await updateCar(a.ctx, car.id, input({ model: "Kept", image: { kind: "keep" } }))).ok).toBe(true);
    expect((await carRow(car.id)).imageKey).toBe(oldKey);
    expect(await storedFiles()).toEqual([oldKey]);

    expect((await updateCar(a.ctx, car.id, input({ image: { kind: "upload", bytes: await png(10) } }))).ok).toBe(true);
    const newKey = (await carRow(car.id)).imageKey!;
    expect(newKey).not.toBe(oldKey);
    expect(await storedFiles()).toEqual([newKey]);
  });

  it.each([
    ["a blocked host", "http://localhost/car.jpg", () => new Response("")],
    ["a refused download", "http://93.184.216.34/car.jpg", () => new Response("nope", { status: 403 })],
    ["a non-image response", "http://93.184.216.34/car.jpg", () => new Response("<html></html>")],
  ])("creates the car without an image and with a notice for %s", async (_name, url, respond) => {
    vi.stubGlobal("fetch", vi.fn(async () => respond()));
    const result = await createCar(a.ctx, input({ image: { kind: "url", url } }));
    expect(result).toMatchObject({ ok: true, notice: "imageNotFetched" });
    expect(result).not.toHaveProperty("errors");
    if (!result.ok) throw new Error("not saved");
    expect(await carRow(result.car.id)).toMatchObject({ model: "Octavia", imageKey: null });
    expect(await storedFiles()).toEqual([]);
  });

  it("keeps the current image and saves other changes when a new image URL can't be downloaded", async () => {
    const car = await created(a.ctx, { image: { kind: "upload", bytes: await png() } });
    const oldKey = (await carRow(car.id)).imageKey!;
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 500 })));

    const url = "http://93.184.216.34/car.jpg";
    const result = await updateCar(a.ctx, car.id, input({ model: "Superb", priceEur: 21000, image: { kind: "url", url } }));
    expect(result).toMatchObject({ ok: true, notice: "imageNotFetched" });
    expect(await carRow(car.id)).toMatchObject({ model: "Superb", priceEur: 21000, imageKey: oldKey });
    expect(await storedFiles()).toEqual([oldKey]);
  });

  it("stores a downloadable image URL without a notice", async () => {
    const bytes = await png();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(bytes, { headers: { "content-type": "image/png" } })));
    const result = await createCar(a.ctx, input({ image: { kind: "url", url: "http://93.184.216.34/car.png" } }));
    expect(result).toMatchObject({ ok: true });
    expect(result).not.toHaveProperty("notice");
    expect(await storedFiles()).toHaveLength(1);
  });

  it("deletes the file when the image is removed", async () => {
    const car = await created(a.ctx, { image: { kind: "upload", bytes: await png() } });
    expect((await updateCar(a.ctx, car.id, input({ image: { kind: "remove" } }))).ok).toBe(true);
    expect((await carRow(car.id)).imageKey).toBeNull();
    expect(await storedFiles()).toEqual([]);
  });
});

describe.each(["read_only", "suspended"] as const)("%s dealer", (status) => {
  it("blocks writes, keeps the old image and removes the newly stored one", async () => {
    const car = await created(a.ctx, { image: { kind: "upload", bytes: await png() } });
    const oldKey = (await carRow(car.id)).imageKey!;
    const auditCount = (await audits()).length;
    await db.update(dealers).set({ status }).where(eq(dealers.id, a.dealer.id));

    await expect(createCar(a.ctx, input({ avtonetUrl: "" }))).rejects.toBeInstanceOf(DealerReadOnlyError);
    await expect(
      updateCar(a.ctx, car.id, input({ model: "Blocked", image: { kind: "upload", bytes: await png(10) } })),
    ).rejects.toBeInstanceOf(DealerReadOnlyError);
    await expect(setCarActive(a.ctx, car.id, false)).rejects.toBeInstanceOf(DealerReadOnlyError);

    expect(await carRow(car.id)).toMatchObject({ model: "Octavia", imageKey: oldKey, active: true });
    expect(await db.select().from(cars)).toHaveLength(1);
    expect(await storedFiles()).toEqual([oldKey]);
    expect(await audits()).toHaveLength(auditCount);
  });
});
