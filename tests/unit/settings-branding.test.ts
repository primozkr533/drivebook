// Real-database tests: start Postgres with `docker compose up -d db` (uses TEST_DATABASE_URL).
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { auditLog, dealers, plans } from "@/db/schema";
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

const { DealerReadOnlyError, ForbiddenError } =
  await import("@/server/auth/permissions");
const { setDbForTests } = await import("@/server/data/db");
const {
  MAX_LOGO_BYTES,
  getBranding,
  removeLogo,
  updatePrimaryColor,
  uploadLogo,
} = await import("@/server/data/settings-branding");

const db = getTestDb();

const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44,
  0x52,
]);
const JPEG = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0,
]);
const WEBP = Buffer.concat([
  Buffer.from("RIFF"),
  Buffer.from([24, 0, 0, 0]),
  Buffer.from("WEBPVP8 "),
  Buffer.alloc(8),
]);
const svg = (inner: string, attrs = "") =>
  Buffer.from(
    `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg"${attrs}>${inner}</svg>`,
  );
const CLEAN_SVG = svg(
  '<defs><linearGradient id="g"/></defs><rect width="10" height="10" fill="url(#g)"/><use href="#g"/>',
);

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

function signIn(
  ctx: DealerContext,
  role: "owner" | "salesperson" = "owner",
): void {
  session = {
    ctx,
    user: {
      id: `u-${role}-${ctx.slug}`,
      email: `${role}@${ctx.slug}.si`,
      role,
    },
    sessionId: "s",
  };
}

const row = async (id: string) =>
  (await db.select().from(dealers).where(eq(dealers.id, id)))[0];
const audits = () => db.select().from(auditLog);
const upload = (
  bytes: Buffer,
  filename = "logo.png",
  declaredType = "image/png",
) => uploadLogo(a.ctx, { bytes, filename, declaredType });

let tempDir: string;
let a: Awaited<ReturnType<typeof seedDealer>>;
let b: Awaited<ReturnType<typeof seedDealer>>;

async function storedFiles(): Promise<string[]> {
  const entries = await readdir(tempDir, {
    recursive: true,
    withFileTypes: true,
  }).catch(() => []);
  return entries
    .filter((e) => e.isFile() && !e.name.endsWith(".meta.json"))
    .map((e) =>
      path
        .relative(tempDir, path.join(e.parentPath, e.name))
        .split(path.sep)
        .join("/"),
    );
}

beforeAll(() => setDbForTests(db));
beforeEach(async () => {
  tempDir = await mkdtemp(path.join(tmpdir(), "drivebook-branding-"));
  storage = createLocalStorage(tempDir);
  await truncateAll();
  session = null;
  const [plan] = await db
    .insert(plans)
    .values({
      code: "basic",
      name: "Basic",
      maxCars: 20,
      maxUsers: 5,
      monthlySmsQuota: 100,
      priceEurCents: 4900,
    })
    .returning();
  a = await seedDealer(plan.id, "alpha");
  b = await seedDealer(plan.id, "beta");
  signIn(a.ctx);
});
afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});
afterAll(async () => {
  setDbForTests(undefined);
  await db.$client.end();
});

describe("getBranding", () => {
  it("returns the colour and no logo by default", async () => {
    expect(await getBranding(a.ctx)).toEqual({
      primaryColor: "#E4572E",
      logoUrl: null,
    });
  });
});

describe("updatePrimaryColor", () => {
  it("accepts #RRGGBB case-insensitively, stores upper-case and audits", async () => {
    expect(await updatePrimaryColor(a.ctx, "#1a2b3c")).toEqual({
      ok: true,
      primaryColor: "#1A2B3C",
    });
    expect((await row(a.dealer.id)).primaryColor).toBe("#1A2B3C");
    expect((await row(b.dealer.id)).primaryColor).toBe("#E4572E");
    const [entry] = await audits();
    expect(entry).toMatchObject({
      action: "dealer.settings.branding.color",
      dealerId: a.dealer.id,
    });
  });

  it.each(["red", "#fff", "#GGGGGG", "1a2b3c", "#1a2b3c4d", ""])(
    "rejects %j",
    async (hex) => {
      expect(await updatePrimaryColor(a.ctx, hex)).toEqual({
        ok: false,
        error: "invalid",
      });
      expect((await row(a.dealer.id)).primaryColor).toBe("#E4572E");
      expect(await audits()).toHaveLength(0);
    },
  );
});

describe("uploadLogo", () => {
  it.each([
    ["png", PNG, "logo.png"],
    ["jpg", JPEG, "logo.jpeg"],
    ["webp", WEBP, "logo.webp"],
    ["svg", CLEAN_SVG, "logo.svg"],
  ] as const)(
    "stores a valid %s and getBranding returns its URL",
    async (ext, bytes, filename) => {
      const result = await upload(bytes, filename);
      expect(result.ok).toBe(true);
      const { logoUrl } = (await getBranding(a.ctx))!;
      expect(logoUrl).toMatch(
        new RegExp(`^/api/files/logos/[0-9A-Za-z]{16}\\.${ext}$`),
      );
      expect(result).toEqual({ ok: true, logoUrl });

      const key = (await row(a.dealer.id)).logoKey!;
      expect(`/api/files/${key}`).toBe(logoUrl);
      const stored = await storage.get(key);
      expect(stored?.data.equals(bytes)).toBe(true);
      expect(await storedFiles()).toEqual([key]);
      expect((await audits()).map((e) => e.action)).toEqual([
        "dealer.settings.branding.logo.upload",
      ]);
    },
  );

  it("stores the detected content type", async () => {
    await upload(CLEAN_SVG, "logo.svg");
    expect(
      (await storage.get((await row(a.dealer.id)).logoKey!))?.contentType,
    ).toBe("image/svg+xml");
  });

  it("detects the type from magic bytes, not the extension", async () => {
    const result = await upload(PNG, "logo.gif", "image/gif");
    expect(result.ok && result.logoUrl.endsWith(".png")).toBe(true);
  });

  it("rejects a text file named logo.png", async () => {
    expect(await upload(Buffer.from("just some text"), "logo.png")).toEqual({
      ok: false,
      error: "unsupported_type",
    });
    expect(
      await upload(Buffer.from("<html><svg></svg></html>"), "logo.svg"),
    ).toEqual({
      ok: false,
      error: "unsupported_type",
    });
    expect(await storedFiles()).toEqual([]);
  });

  it("rejects empty and oversized files", async () => {
    expect(await upload(Buffer.alloc(0))).toEqual({
      ok: false,
      error: "empty",
    });
    const tooLarge = Buffer.concat([
      PNG,
      Buffer.alloc(MAX_LOGO_BYTES + 1 - PNG.length),
    ]);
    expect(tooLarge.length).toBe(2 * 1024 * 1024 + 1);
    expect(await upload(tooLarge)).toEqual({ ok: false, error: "too_large" });
    const exact = Buffer.concat([
      PNG,
      Buffer.alloc(MAX_LOGO_BYTES - PNG.length),
    ]);
    expect((await upload(exact)).ok).toBe(true);
  });

  it.each([
    ["<script>", svg("<script>alert(1)</script>")],
    ["onload=", svg("", ' onload="alert(1)"')],
    ["onclick=", svg('<rect onclick = "x()"/>')],
    ["javascript:", svg('<a href="javascript:alert(1)"><rect/></a>')],
    ["<foreignObject>", svg("<foreignObject><div/></foreignObject>")],
    ["external href", svg('<image href="https://evil.example/x.png"/>')],
    ["external xlink:href", svg('<use xlink:href="//evil.example/s.svg#a"/>')],
    ["external url()", svg('<rect style="fill:url(https://evil.example/p)"/>')],
    [
      "a namespace-prefixed <script>",
      svg('<s:script xmlns:s="http://www.w3.org/2000/svg">alert(1)</s:script>'),
    ],
    [
      "a namespace-prefixed <foreignObject>",
      svg('<x:foreignObject xmlns:x="http://www.w3.org/2000/svg"/>'),
    ],
    [
      "an <animate> setting href via a character reference",
      svg('<a><animate attributeName="href" values="jav&#x61;script:alert(1)"/><rect/></a>'),
    ],
    ["a <set> element", svg('<a><set attributeName="href" to="#a"/><rect/></a>')],
    ["a namespace-prefixed onload=", svg('<rect x:onload="alert(1)"/>')],
  ])("rejects an SVG with %s", async (_label, bytes) => {
    expect(await upload(bytes, "logo.svg")).toEqual({
      ok: false,
      error: "unsafe_svg",
    });
    expect(await storedFiles()).toEqual([]);
    expect((await row(a.dealer.id)).logoKey).toBeNull();
  });

  it("replacing a logo deletes the old file after commit", async () => {
    await upload(PNG);
    const first = (await row(a.dealer.id)).logoKey!;
    await upload(JPEG, "new.jpg");
    const second = (await row(a.dealer.id)).logoKey!;
    expect(second).not.toBe(first);
    expect(await storage.get(first)).toBeNull();
    expect(await storedFiles()).toEqual([second]);
  });

  it("deletes the new file when the DB write fails", async () => {
    await db
      .update(dealers)
      .set({ status: "read_only" })
      .where(eq(dealers.id, a.dealer.id));
    await expect(upload(PNG)).rejects.toBeInstanceOf(DealerReadOnlyError);
    expect(await storedFiles()).toEqual([]);
    expect((await row(a.dealer.id)).logoKey).toBeNull();
  });
});

describe("removeLogo", () => {
  it("clears the key and deletes the file", async () => {
    await upload(PNG);
    const key = (await row(a.dealer.id)).logoKey!;
    expect(await removeLogo(a.ctx)).toEqual({ ok: true });
    expect((await row(a.dealer.id)).logoKey).toBeNull();
    expect(await storage.get(key)).toBeNull();
    expect(await storedFiles()).toEqual([]);
    expect((await getBranding(a.ctx))!.logoUrl).toBeNull();
    expect((await audits()).map((e) => e.action)).toContain(
      "dealer.settings.branding.logo.remove",
    );
  });

  it("is a no-op without a logo", async () => {
    expect(await removeLogo(a.ctx)).toEqual({ ok: true });
  });
});

describe("permissions", () => {
  it("refuses a Salesperson", async () => {
    signIn(a.ctx, "salesperson");
    await expect(getBranding(a.ctx)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(updatePrimaryColor(a.ctx, "#1a2b3c")).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(upload(PNG)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(removeLogo(a.ctx)).rejects.toBeInstanceOf(ForbiddenError);
    expect(await storedFiles()).toEqual([]);
  });

  it("refuses an Owner of another dealer", async () => {
    signIn(b.ctx);
    await expect(updatePrimaryColor(a.ctx, "#1a2b3c")).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(upload(PNG)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
