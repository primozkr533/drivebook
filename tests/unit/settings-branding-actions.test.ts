// Real-database tests: start Postgres with `docker compose up -d db` (uses TEST_DATABASE_URL).
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { auditLog, dealers, plans } from "@/db/schema";
import type { FileStorage } from "@/server/storage/types";
import { createLocalStorage } from "@/server/storage/local";
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

let storage: FileStorage;
vi.mock("@/server/storage", () => ({ getStorage: () => storage }));

const { setDbForTests } = await import("@/server/data/db");
const { saveLogoAction, savePrimaryColorAction } = await import("@/app/dealer-admin/(app)/settings/branding/actions");
const { ColorForm } = await import("@/app/dealer-admin/(app)/settings/branding/BrandingForms");
const { MAX_LOGO_BYTES } = await import("@/server/data/settings-branding");

const db = getTestDb();

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const png = (size: number) => {
  const bytes = new Uint8Array(size);
  bytes.set(PNG_SIGNATURE);
  return bytes;
};

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

const logoForm = (file: File | null, intent = "upload") => {
  const data = new FormData();
  data.set("intent", intent);
  if (file) data.set("logo", file);
  return data;
};
const colorForm = (primaryColor: string) => {
  const data = new FormData();
  data.set("primaryColor", primaryColor);
  return data;
};

const dealerRow = async () => (await db.select().from(dealers))[0];
const audits = () => db.select().from(auditLog);

let tempDir: string;
async function storedFiles(): Promise<string[]> {
  const entries = await readdir(tempDir, { recursive: true, withFileTypes: true }).catch(() => []);
  return entries.filter((e) => e.isFile() && !e.name.endsWith(".meta.json")).map((e) => e.name);
}

beforeAll(() => setDbForTests(db));
beforeEach(async () => {
  await truncateAll();
  state.user = null;
  tempDir = await mkdtemp(path.join(tmpdir(), "drivebook-branding-actions-"));
  storage = createLocalStorage(tempDir);
});
afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});
afterAll(async () => {
  setDbForTests(undefined);
  await db.$client.end();
});

describe("saveLogoAction", () => {
  it("uploads a 1.5 MB PNG and returns its /api/files/logos/ URL", async () => {
    const dealer = await seedDealer();
    state.user = { id: "owner-1", role: "owner", dealerId: dealer.id };
    const file = new File([png(1.5 * 1024 * 1024)], "logo.png", { type: "image/png" });
    const result = await saveLogoAction({ logoUrl: null }, logoForm(file));
    expect(result.saved).toBe("uploaded");
    expect(result.logoUrl).toMatch(/^\/api\/files\/logos\/[^/]+\.png$/);
    expect((await dealerRow()).logoKey).toBe(result.logoUrl!.replace("/api/files/", ""));
    expect(await storedFiles()).toHaveLength(1);
  });

  it.each([
    ["too_large", new File([png(MAX_LOGO_BYTES + 1)], "big.png", { type: "image/png" })],
    ["unsupported_type", new File(["GIF89a"], "logo.gif", { type: "image/gif" })],
    ["unsafe_svg", new File(['<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>'], "x.svg", { type: "image/svg+xml" })],
    ["empty", null],
  ])("returns %s, keeps the current logo and stores nothing", async (error, file) => {
    const dealer = await seedDealer();
    state.user = { id: "owner-1", role: "owner", dealerId: dealer.id };
    expect(await saveLogoAction({ logoUrl: "/api/files/logos/old.png" }, logoForm(file))).toEqual({
      logoUrl: "/api/files/logos/old.png",
      error,
    });
    expect((await dealerRow()).logoKey).toBeNull();
    expect(await storedFiles()).toHaveLength(0);
    expect(await audits()).toHaveLength(0);
  });

  it("removes the logo and its file", async () => {
    const dealer = await seedDealer();
    state.user = { id: "owner-1", role: "owner", dealerId: dealer.id };
    const uploaded = await saveLogoAction({ logoUrl: null }, logoForm(new File([png(64)], "logo.png")));
    expect(await saveLogoAction(uploaded, logoForm(null, "remove"))).toEqual({ logoUrl: null, saved: "removed" });
    expect((await dealerRow()).logoKey).toBeNull();
    expect(await storedFiles()).toHaveLength(0);
  });

  it("returns forbidden for a Salesperson and changes nothing", async () => {
    const dealer = await seedDealer();
    await db.update(dealers).set({ logoKey: "logos/existing.png" });
    state.user = { id: "sales-1", role: "salesperson", dealerId: dealer.id };
    const prev = { logoUrl: "/api/files/logos/existing.png" };
    expect(await saveLogoAction(prev, logoForm(new File([png(64)], "logo.png")))).toEqual({ ...prev, error: "forbidden" });
    expect(await saveLogoAction(prev, logoForm(null, "remove"))).toEqual({ ...prev, error: "forbidden" });
    expect((await dealerRow()).logoKey).toBe("logos/existing.png");
    expect(await storedFiles()).toHaveLength(0);
    expect(await audits()).toHaveLength(0);
  });

  it("returns readOnly for a restricted dealer", async () => {
    const dealer = await seedDealer();
    await db.update(dealers).set({ status: "read_only" });
    state.user = { id: "owner-1", role: "owner", dealerId: dealer.id };
    expect(await saveLogoAction({ logoUrl: null }, logoForm(new File([png(64)], "logo.png")))).toEqual({
      logoUrl: null,
      error: "readOnly",
    });
    expect(await storedFiles()).toHaveLength(0);
  });

  it("redirects to login without a session", async () => {
    await expect(saveLogoAction({ logoUrl: null }, logoForm(null, "remove"))).rejects.toThrow("redirect");
  });
});

describe("savePrimaryColorAction", () => {
  it("saves a normalised colour", async () => {
    const dealer = await seedDealer();
    state.user = { id: "owner-1", role: "owner", dealerId: dealer.id };
    expect(await savePrimaryColorAction({}, colorForm("#f5e663"))).toEqual({ primaryColor: "#F5E663", saved: true });
    expect((await dealerRow()).primaryColor).toBe("#F5E663");
  });

  it("rejects an invalid colour", async () => {
    const dealer = await seedDealer();
    state.user = { id: "owner-1", role: "owner", dealerId: dealer.id };
    expect(await savePrimaryColorAction({}, colorForm("red"))).toEqual({ primaryColor: "red", error: "invalid" });
    expect((await dealerRow()).primaryColor).toBe("#E4572E");
  });

  it("returns forbidden for a Salesperson and changes nothing", async () => {
    const dealer = await seedDealer();
    state.user = { id: "sales-1", role: "salesperson", dealerId: dealer.id };
    expect(await savePrimaryColorAction({}, colorForm("#000000"))).toEqual({ primaryColor: "#000000", error: "forbidden" });
    expect((await dealerRow()).primaryColor).toBe("#E4572E");
    expect(await audits()).toHaveLength(0);
  });
});

describe("ColorForm preview", () => {
  const labels = {
    picker: "p", hex: "h", hexHint: "hh", preview: "pv", previewBand: "band", previewButton: "btn", submit: "s", saved: "ok",
    errors: { invalid: "inv", forbidden: "f", readOnly: "r" },
  };
  const previewStyle = (color: string) => {
    const html = renderToStaticMarkup(createElement(ColorForm, { action: async () => ({}), initialColor: color, labels }));
    return html.match(/style="([^"]*)"[^>]*data-testid="branding-preview"/)?.[1];
  };

  it("uses dark text on a light colour and light text on a dark one via brandStyle", () => {
    expect(previewStyle("#F5E663")).toBe("--brand:#F5E663;--on-brand:#17140F");
    expect(previewStyle("#1B2A49")).toBe("--brand:#1B2A49;--on-brand:#FBFAF8");
  });
});
