import { createElement, type ReactNode } from "react";
import { prerender } from "react-dom/static";
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { messages } from "./i18n";
import { getConfig, resetConfigForTests } from "@/lib/config";
import { carDeepLink } from "@/lib/car-link";
import { mergeAutofill, parseCarStatusFilter, type CarDraft } from "@/app/dealer-admin/(app)/cars/form-model";

vi.mock("next-intl/server", () => ({
  getRequestConfig: <T>(fn: T) => fn,
  getTranslations: async (namespace: "cars" | "account" | "backoffice" | "settings") => {
    const { messages } = await import("./i18n");
    return createTranslator({ locale: "sl", messages, namespace });
  },
}));

const mocks = vi.hoisted(() => ({
  headers: new Headers(),
  dealerSession: null as unknown,
  listCarsForAdmin: vi.fn(),
  getCarForAdmin: vi.fn(),
  getDealerName: vi.fn(),
  push: vi.fn(),
}));

vi.mock("next/headers", () => ({ headers: async () => mocks.headers }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/_dev/app/cars",
  useRouter: () => ({ push: mocks.push }),
  redirect: (url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("@/server/auth/session", () => ({
  getCurrentSession: async () => null,
  getDealerContextFromSession: async () => mocks.dealerSession,
  setSessionCookie: vi.fn(),
  clearSessionCookie: vi.fn(),
}));
vi.mock("@/server/auth/login", () => ({ login: vi.fn(), logout: vi.fn() }));
vi.mock("@/server/data/dealers", () => ({ getDealerName: mocks.getDealerName }));
vi.mock("@/server/data/cars", () => ({
  listCarsForAdmin: mocks.listCarsForAdmin,
  getCarForAdmin: mocks.getCarForAdmin,
}));
vi.mock("@/app/dealer-admin/(app)/cars/actions", () => ({
  saveCarAction: vi.fn(),
  setCarActiveAction: vi.fn(),
  autofillFromAvtonetAction: vi.fn(),
}));

const { default: CarsPage } = await import("@/app/dealer-admin/(app)/cars/page");
const { default: NewCarPage } = await import("@/app/dealer-admin/(app)/cars/new/page");
const { default: EditCarPage } = await import("@/app/dealer-admin/(app)/cars/[id]/page");
const { default: DealerAppLayout } = await import("@/app/dealer-admin/(app)/layout");

const ctx = { dealerId: "dealer-1", slug: "demo", status: "active" };
const c = messages.cars;

const car = (over: Record<string, unknown> = {}) => ({
  id: "k3x9QpZ2",
  make: "Škoda",
  model: "Octavia",
  year: 2021,
  priceEur: 18900,
  body: "estate",
  active: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...over,
});

function setEnv(env: Record<string, string>) {
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  resetConfigForTests();
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.headers = new Headers({ "x-drivebook-base-path": "/_dev/app" });
  mocks.dealerSession = { ctx, user: { id: "u1", email: "prodajalec@demo.si", role: "salesperson" }, sessionId: "s1" };
  mocks.getDealerName.mockResolvedValue("Avto Demo d.o.o.");
  setEnv({ PUBLIC_URL_SCHEME: "http", PUBLIC_URL_PORT: "3000", BASE_DOMAIN: "drivebook.localhost" });
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetConfigForTests();
});

async function render(node: ReactNode) {
  const wrapped = createElement(NextIntlClientProvider, { locale: "sl", messages, timeZone: "Europe/Ljubljana", children: node });
  const { prelude } = await prerender(wrapped);
  return new Response(prelude).text();
}

const fileUrl = (name: string) => ["", "api", "files", "cars", name].join("/");
const editHref = ["", "_dev", "app", "cars", "k3x9QpZ2"].join("/");

const decode = (html: string) => html.replace(/&amp;/g, "&");

describe("carDeepLink", () => {
  it("builds the dev link with scheme and port", () => {
    expect(carDeepLink("demo", "k3x9QpZ2")).toBe("http://demo.drivebook.localhost:3000/?car=k3x9QpZ2");
  });

  it("omits an empty port and uses https in production-like config", () => {
    setEnv({ PUBLIC_URL_SCHEME: "https", PUBLIC_URL_PORT: "", BASE_DOMAIN: "drivebook.si" });
    expect(carDeepLink("novak", "abc")).toBe("https://novak.drivebook.si/?car=abc");
  });

  it("accepts an explicit config and encodes the id", () => {
    const config = { ...getConfig(), publicUrlScheme: "https" as const, publicUrlPort: "8443", baseDomain: "example.si" };
    expect(carDeepLink("demo", "a b", config)).toBe("https://demo.example.si:8443/?car=a%20b");
  });
});

describe("parseCarStatusFilter", () => {
  it.each([
    [undefined, "active"],
    ["", "active"],
    ["active", "active"],
    ["inactive", "inactive"],
    ["all", "all"],
    ["ALL", "active"],
    ["deleted", "active"],
    [["inactive", "all"], "inactive"],
  ] as const)("%j → %s", (raw, expected) => {
    expect(parseCarStatusFilter(raw as string | string[] | undefined)).toBe(expected);
  });
});

describe("mergeAutofill", () => {
  const empty: CarDraft = { make: "", model: "", year: "", price: "", imageUrl: "" };
  const fields = { make: "BMW", model: "320d", year: 2019, price: 21500, imageUrl: "https://images.avto.net/1.jpg" };

  it("fills every empty field and reports them", () => {
    expect(mergeAutofill(empty, fields)).toEqual({
      draft: { make: "BMW", model: "320d", year: "2019", price: "21500", imageUrl: "https://images.avto.net/1.jpg" },
      filled: ["make", "model", "year", "price", "imageUrl"],
    });
  });

  it("never overwrites a field the user already filled", () => {
    const draft = { ...empty, make: "Škoda", price: "18900" };
    const result = mergeAutofill(draft, fields);
    expect(result.draft).toMatchObject({ make: "Škoda", price: "18900", model: "320d", year: "2019" });
    expect(result.filled).toEqual(["model", "year", "imageUrl"]);
  });

  it("treats whitespace-only as empty and skips missing auto-fill values", () => {
    const result = mergeAutofill({ ...empty, model: "  " }, { model: "Golf" });
    expect(result.draft).toEqual({ ...empty, model: "Golf" });
    expect(result.filled).toEqual(["model"]);
  });

  it("keeps an existing image", () => {
    const result = mergeAutofill(empty, fields, { hasImage: true });
    expect(result.draft.imageUrl).toBe("");
    expect(result.filled).not.toContain("imageUrl");
  });
});

describe("cars list page", () => {
  const page = (status?: string) => CarsPage({ searchParams: Promise.resolve(status ? { status } : {}) });

  it.each([
    [undefined, "active"],
    ["inactive", "inactive"],
    ["all", "all"],
    ["bogus", "active"],
  ])("passes ?status=%s to the data layer as %s and marks the filter", async (status, expected) => {
    mocks.listCarsForAdmin.mockResolvedValue([car()]);
    const html = await render(await page(status));
    expect(mocks.listCarsForAdmin).toHaveBeenCalledWith(ctx, { status: expected });
    for (const s of ["active", "inactive", "all"]) {
      const link = html.match(new RegExp(`<a[^>]*href="/_dev/app/cars\\?status=${s}"[^>]*>`))?.[0] ?? "";
      expect(link).not.toBe("");
      if (s === expected) expect(link).toContain('aria-current="page"');
      else expect(link).not.toContain("aria-current");
    }
  });

  it("shows each car with price, status badge, edit link, toggle and the public deep link", async () => {
    mocks.listCarsForAdmin.mockResolvedValue([
      car(),
      car({ id: "inact1ve", make: "VW", model: "Golf", active: false, imageUrl: fileUrl("x.webp") }),
    ]);
    const html = decode(await render(await page("all")));
    expect(html).toContain("Octavia");
    expect(html).toContain("2021");
    expect(html).toMatch(/18\.900\s€/);
    expect(html).toContain(c.status.active);
    expect(html).toContain(c.status.inactive);
    expect(html).toContain(`href="${editHref}"`);
    expect(html).toContain("http://demo.drivebook.localhost:3000/?car=k3x9QpZ2");
    expect(html).toContain("http://demo.drivebook.localhost:3000/?car=inact1ve");
    expect(html).toContain(`>${c.copy}</button>`);
    expect(html).toContain('data-testid="car-silhouette"');
    expect(html).toContain(`src="${fileUrl("x.webp")}"`);
    expect(html).toMatch(/name="active" value="0"/);
    expect(html).toMatch(/name="active" value="1"/);
    expect(html).toContain(`>${c.deactivate}</button>`);
    expect(html).toContain(`>${c.reactivate}</button>`);
    expect(html.match(/data-testid="car-add"/g)).toHaveLength(1);
  });

  it.each(["readOnly", "forbidden", "limit"] as const)("renders the %s notice for ?notice= and keeps the filter", async (notice) => {
    mocks.listCarsForAdmin.mockResolvedValue([car()]);
    const html = decode(
      await render(await CarsPage({ searchParams: Promise.resolve({ status: "inactive", notice }) })),
    );
    expect(html).toContain(`data-state="${notice}"`);
    expect(html).toContain(c.errors[notice]);
    expect(html).toContain('name="filter" value="inactive"');
  });

  it("renders no notice without or with an unknown ?notice=", async () => {
    mocks.listCarsForAdmin.mockResolvedValue([car()]);
    for (const query of [{}, { notice: "bogus" }]) {
      const html = await render(await CarsPage({ searchParams: Promise.resolve(query) }));
      expect(html).not.toContain('data-testid="cars-notice"');
      expect(html).not.toContain(c.errors.readOnly);
    }
  });

  it("shows the empty state with a single Add car primary action", async () => {
    mocks.listCarsForAdmin.mockResolvedValue([]);
    const html = await render(await page());
    expect(html).toContain('data-testid="cars-empty"');
    expect(html).toContain(c.empty.active);
    expect(html.match(/data-testid="car-add"/g)).toHaveLength(1);
    expect(html).toContain('href="/_dev/app/cars/new"');
  });
});

describe("car form pages", () => {
  it("renders the new-car form with the exact field names and the auto-fill button", async () => {
    const html = await render(await NewCarPage());
    for (const name of ["id", "make", "model", "year", "price", "avtonetUrl", "imageFile", "imageUrl", "removeImage"]) {
      expect(html).toContain(`name="${name}"`);
    }
    expect(html).toContain(c.form.autofill);
    expect(html).toContain(`<label`);
    expect(html).toContain(c.form.save);
  });

  it("prefills the edit form for the dealer's own car", async () => {
    mocks.getCarForAdmin.mockResolvedValue(car({ avtoNetUrl: "https://www.avto.net/Ads/details.asp?id=1", imageUrl: fileUrl("a.webp") }));
    const html = decode(await render(await EditCarPage({ params: Promise.resolve({ id: "k3x9QpZ2" }) })));
    expect(mocks.getCarForAdmin).toHaveBeenCalledWith(ctx, "k3x9QpZ2");
    expect(html).toContain('name="id" value="k3x9QpZ2"');
    expect(html).toContain('value="Octavia"');
    expect(html).toContain('value="18900"');
    expect(html).toContain('value="https://www.avto.net/Ads/details.asp?id=1"');
    expect(html).toContain(`src="${fileUrl("a.webp")}"`);
    expect(html).toContain(c.form.removeImage);
  });

  it("404s for an unknown or other dealer's car id", async () => {
    mocks.getCarForAdmin.mockResolvedValue(null);
    await expect(EditCarPage({ params: Promise.resolve({ id: "other-dealer-car" }) })).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

describe("cars nav item", () => {
  const navLink = new RegExp(`<a[^>]*href="/_dev/app/cars"[^>]*>${c.nav}</a>`, "g");

  it.each(["owner", "salesperson"])("is in the inline nav and the compact menu for a %s", async (role) => {
    mocks.dealerSession = { ctx, user: { id: "u1", email: "a@demo.si", role }, sessionId: "s1" };
    const html = await render(await DealerAppLayout({ children: createElement("p", null, "x") }));
    expect(html.match(navLink)).toHaveLength(2);
  });
});
