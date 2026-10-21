import { createElement, type ReactNode } from "react";
import { prerender } from "react-dom/static";
import { createTranslator } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { messages } from "./i18n";
import DealerAppLayout from "@/app/dealer-admin/(app)/layout";
import DealerHomePage from "@/app/dealer-admin/(app)/page";
import DealerAccountPage from "@/app/dealer-admin/(app)/account/page";
import BackofficeAppLayout from "@/app/backoffice/(app)/layout";
import BackofficeHomePage from "@/app/backoffice/(app)/page";
import BackofficeAccountPage from "@/app/backoffice/(app)/account/page";
import BackofficeDealersPage from "@/app/backoffice/(app)/dealers/page";

vi.mock("next-intl/server", () => ({
  getRequestConfig: <T>(fn: T) => fn,
  getTranslations: async (namespace: "auth" | "account" | "backoffice") => {
    const { messages } = await import("./i18n");
    return createTranslator({ locale: "sl", messages, namespace });
  },
}));

const mocks = vi.hoisted(() => ({
  headers: new Headers(),
  dealerSession: null as unknown,
  backofficeSession: null as unknown,
  getDealerName: vi.fn(),
  getAccountSummary: vi.fn(),
  listDealers: vi.fn(),
  pathname: "/",
}));

vi.mock("next/headers", () => ({ headers: async () => mocks.headers }));
vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  redirect: (url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  },
}));
vi.mock("@/server/auth/session", () => ({
  getCurrentSession: async () => mocks.backofficeSession,
  getDealerContextFromSession: async () => mocks.dealerSession,
  setSessionCookie: vi.fn(),
  clearSessionCookie: vi.fn(),
}));
vi.mock("@/server/auth/login", () => ({ login: vi.fn(), logout: vi.fn() }));
vi.mock("@/server/data/dealers", () => ({ getDealerName: mocks.getDealerName }));
vi.mock("@/server/auth/account", () => ({ getAccountSummary: mocks.getAccountSummary }));
vi.mock("@/server/data/backoffice/dealers", () => ({ listDealers: mocks.listDealers }));

const ctx = { dealerId: "dealer-1", slug: "demo", status: "active" };

beforeEach(() => {
  mocks.headers = new Headers();
  mocks.dealerSession = null;
  mocks.backofficeSession = null;
  mocks.pathname = "/";
  vi.clearAllMocks();
});

async function render(node: ReactNode) {
  const { prelude } = await prerender(node);
  return new Response(prelude).text();
}

async function redirectOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
  } catch (error) {
    return (error as { url?: string }).url;
  }
  return undefined;
}

const account = messages.account;
const dealersT = messages.backoffice.dealers;
const child = createElement("p", { "data-testid": "child" }, "vsebina");

const surfaces = [
  {
    name: "dealer-admin",
    Layout: DealerAppLayout,
    Home: DealerHomePage,
    Account: DealerAccountPage,
    alias: "/_dev/app",
    home: "/account",
    signIn: () => {
      mocks.dealerSession = { ctx, user: { id: "u1", email: "prodaja@demo.si", role: "owner" } };
      mocks.getDealerName.mockResolvedValue("Avto Demo d.o.o.");
    },
    context: "Avto Demo d.o.o.",
  },
  {
    name: "backoffice",
    Layout: BackofficeAppLayout,
    Home: BackofficeHomePage,
    Account: BackofficeAccountPage,
    alias: "/_dev/admin",
    home: "/dealers",
    signIn: () => {
      mocks.backofficeSession = { session: {}, user: { id: "u2", email: "prodaja@demo.si", role: "support" } };
    },
    context: messages.auth.eyebrowBackoffice,
  },
];

describe.each(surfaces)("$name (app) group", ({ Layout, Home, Account, alias, home, signIn, context }) => {
  it.each(["", alias])("redirects to the login page without a session (base path %j)", async (basePath) => {
    mocks.headers = new Headers({ "x-drivebook-base-path": basePath });
    expect(await redirectOf(render(createElement(Layout, { children: child })))).toBe(`${basePath}/login`);
    expect(await redirectOf(Home())).toBe(`${basePath}/login`);
    expect(await redirectOf(render(createElement(Account)))).toBe(`${basePath}/login`);
  });

  it.each(["", alias])("sends the signed-in home to the surface home page (base path %j)", async (basePath) => {
    signIn();
    mocks.headers = new Headers({ "x-drivebook-base-path": basePath });
    expect(await redirectOf(Home())).toBe(`${basePath}${home}`);
  });

  it("renders the header with nav, context, email, logout and the compact menu", async () => {
    signIn();
    mocks.headers = new Headers({ "x-drivebook-base-path": alias });
    const html = await render(createElement(Layout, { children: child }));
    expect(html).toContain('data-testid="child"');
    expect(html.match(new RegExp(`<a[^>]*href="${alias}/account"[^>]*>${account.navAccount}</a>`, "g"))).toHaveLength(2);
    expect(html).toMatch(new RegExp(`data-testid="header-context"[^>]*>${context}<`));
    expect(html).toMatch(/data-testid="header-email"[^>]*>prodaja@demo\.si</);
    expect(html).toContain('data-testid="logout"');
    expect(html).toMatch(/<button[^>]*aria-expanded="false"[^>]*data-testid="compact-menu-button"/);
    expect(html).toMatch(/data-testid="compact-menu-panel"[^>]*hidden|hidden[^>]*data-testid="compact-menu-panel"/);
  });

  it.each(["", alias])("marks Account active in the inline nav and the compact menu on the account page (base path %j)", async (basePath) => {
    signIn();
    mocks.headers = new Headers({ "x-drivebook-base-path": basePath });
    const href = `${basePath}/account`;
    const link = new RegExp(`<a[^>]*href="${href}"[^>]*>${account.navAccount}</a>`, "g");

    for (const pathname of [href, `${href}/2fa`]) {
      mocks.pathname = pathname;
      const links = (await render(createElement(Layout, { children: child }))).match(link) ?? [];
      expect(links).toHaveLength(2);
      for (const a of links) expect(a).toContain('aria-current="page"');
    }

    for (const pathname of [basePath || "/", `${href}x`, ["", "other", "account"].join("/")]) {
      mocks.pathname = pathname;
      const html = await render(createElement(Layout, { children: child }));
      expect(html).not.toContain('aria-current="page"');
    }
  });

  it("renders the account page for the signed-in user", async () => {
    signIn();
    mocks.getAccountSummary.mockResolvedValue({ email: "prodaja@demo.si", role: "owner", totpEnabled: false });
    const html = await render(createElement(Account));
    expect(html).toContain(`>${account.title}</h1>`);
    expect(html).toMatch(/data-testid="account-email"[^>]*>prodaja@demo\.si</);
    expect(html).toContain(account.passwordTitle);
    for (const id of ["current-password", "new-password", "confirm-password", "change-password-submit", "totp-enable"]) {
      expect(html).toContain(`data-testid="${id}"`);
    }
    expect(html).toMatch(/data-testid="totp-state" data-state="off"/);
    expect(html).toContain(account.totpOff);
    expect(html).not.toContain('data-testid="totp-disable"');
  });

  it("shows the disable form when 2FA is on", async () => {
    signIn();
    mocks.getAccountSummary.mockResolvedValue({ email: "prodaja@demo.si", role: "support", totpEnabled: true });
    const html = await render(createElement(Account));
    expect(html).toMatch(/data-testid="totp-state" data-state="on"/);
    for (const id of ["totp-disable-password", "totp-disable-code", "totp-disable"]) {
      expect(html).toContain(`data-testid="${id}"`);
    }
    expect(html).not.toContain('data-testid="totp-enable"');
  });

  it("reads the account of the session user", async () => {
    signIn();
    mocks.getAccountSummary.mockResolvedValue({ email: "prodaja@demo.si", role: "owner", totpEnabled: false });
    await render(createElement(Account));
    expect(mocks.getAccountSummary).toHaveBeenCalledWith(expect.stringMatching(/^(dealer|backoffice)$/), expect.stringMatching(/^u[12]$/));
  });
});

it("reads the dealer name through the session's DealerContext", async () => {
  mocks.dealerSession = { ctx, user: { id: "u1", email: "a@b.si", role: "salesperson" } };
  mocks.getDealerName.mockResolvedValue("Avto Demo d.o.o.");
  await render(createElement(DealerAppLayout, { children: child }));
  expect(mocks.getDealerName).toHaveBeenCalledWith(ctx);
});

describe("backoffice dealers", () => {
  const signInBackoffice = () => {
    mocks.backofficeSession = { session: {}, user: { id: "u2", email: "ops@drivebook.si", role: "support" } };
  };
  const renderDealers = (query: Record<string, string | string[]> = {}) =>
    render(createElement(BackofficeDealersPage, { searchParams: Promise.resolve(query) }));

  it.each(["", "/_dev/admin"])("marks Trgovci active in the inline nav and the compact menu (base path %j)", async (basePath) => {
    signInBackoffice();
    mocks.headers = new Headers({ "x-drivebook-base-path": basePath });
    mocks.pathname = `${basePath}/dealers`;
    const html = await render(createElement(BackofficeAppLayout, { children: child }));
    const links = html.match(new RegExp(`<a[^>]*href="${basePath}/dealers"[^>]*>${dealersT.nav}</a>`, "g")) ?? [];
    expect(links).toHaveLength(2);
    for (const a of links) expect(a).toContain('aria-current="page"');
  });

  it("does not show Trgovci in the dealer admin header", async () => {
    mocks.dealerSession = { ctx, user: { id: "u1", email: "a@b.si", role: "owner" } };
    mocks.getDealerName.mockResolvedValue("Avto Demo d.o.o.");
    const html = await render(createElement(DealerAppLayout, { children: child }));
    expect(html).not.toContain(`>${dealersT.nav}</a>`);
  });

  it("redirects to the login page without a session", async () => {
    mocks.headers = new Headers({ "x-drivebook-base-path": "/_dev/admin" });
    expect(await redirectOf(renderDealers())).toBe("/_dev/admin/login");
    expect(mocks.listDealers).not.toHaveBeenCalled();
  });

  it("lists dealers with name, slug plate, status badge, licence date and plan", async () => {
    signInBackoffice();
    mocks.listDealers.mockResolvedValue([
      { id: "d1", name: "Avto Demo d.o.o.", slug: "demo", status: "active", licenceValidUntil: "2027-03-05", planName: "Osnovni" },
      { id: "d2", name: "Avto Novak", slug: "novak", status: "suspended", licenceValidUntil: null, planName: "Pro" },
    ]);
    const html = await renderDealers();
    expect(mocks.listDealers).toHaveBeenCalledWith({ q: undefined, status: undefined });
    expect(html.match(/data-testid="dealer-row"/g)).toHaveLength(2);
    for (const text of ["Avto Demo d.o.o.", ">demo<", "5. 3. 2027", "Osnovni", "Avto Novak", dealersT.noLicence, "Pro"]) {
      expect(html).toContain(text);
    }
    expect(html).toContain(`>${dealersT.statuses.active}<`);
    expect(html).toContain(`>${dealersT.statuses.suspended}<`);
    expect(html).toMatch(/bg-ok-wash[^"]*"><span[^>]*><\/span>Aktiven/);
    expect(html).toMatch(/bg-danger-wash[^"]*"><span[^>]*><\/span>Začasno ustavljen/);
    expect(html).not.toMatch(/<a[^>]*href="[^"]*\/dealers\/[^"]*"/);
  });

  it("passes the search and status filter from the query and keeps them in the GET form", async () => {
    signInBackoffice();
    mocks.listDealers.mockResolvedValue([]);
    const html = await renderDealers({ q: "  dem ", status: "suspended" });
    expect(mocks.listDealers).toHaveBeenCalledWith({ q: "dem", status: "suspended" });
    expect(html).toMatch(/<form[^>]*method="get"/);
    expect(html).toMatch(/<input[^>]*name="q"[^>]*value="dem"/);
    expect(html).toMatch(/<option value="suspended" selected="">/);
    expect(html).toContain('data-testid="dealers-empty"');
  });

  it("ignores an unknown status filter", async () => {
    signInBackoffice();
    mocks.listDealers.mockResolvedValue([]);
    await renderDealers({ status: "deleted" });
    expect(mocks.listDealers).toHaveBeenCalledWith({ q: undefined, status: undefined });
  });
});
