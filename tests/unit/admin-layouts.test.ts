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

vi.mock("next-intl/server", () => ({
  getRequestConfig: <T>(fn: T) => fn,
  getTranslations: async (namespace: "auth" | "account") => {
    const { messages } = await import("./i18n");
    return createTranslator({ locale: "sl", messages, namespace });
  },
}));

const mocks = vi.hoisted(() => ({
  headers: new Headers(),
  dealerSession: null as unknown,
  backofficeSession: null as unknown,
  getDealerName: vi.fn(),
}));

vi.mock("next/headers", () => ({ headers: async () => mocks.headers }));
vi.mock("next/navigation", () => ({
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

const ctx = { dealerId: "dealer-1", slug: "demo", status: "active" };

beforeEach(() => {
  mocks.headers = new Headers();
  mocks.dealerSession = null;
  mocks.backofficeSession = null;
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
const child = createElement("p", { "data-testid": "child" }, "vsebina");

const surfaces = [
  {
    name: "dealer-admin",
    Layout: DealerAppLayout,
    Home: DealerHomePage,
    Account: DealerAccountPage,
    alias: "/_dev/app",
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
    signIn: () => {
      mocks.backofficeSession = { session: {}, user: { id: "u2", email: "prodaja@demo.si", role: "support" } };
    },
    context: messages.auth.eyebrowBackoffice,
  },
];

describe.each(surfaces)("$name (app) group", ({ Layout, Home, Account, alias, signIn, context }) => {
  it.each(["", alias])("redirects to the login page without a session (base path %j)", async (basePath) => {
    mocks.headers = new Headers({ "x-drivebook-base-path": basePath });
    expect(await redirectOf(render(createElement(Layout, { children: child })))).toBe(`${basePath}/login`);
    expect(await redirectOf(Home())).toBe(`${basePath}/login`);
    expect(await redirectOf(render(createElement(Account)))).toBe(`${basePath}/login`);
  });

  it.each(["", alias])("sends the signed-in home to the account page (base path %j)", async (basePath) => {
    signIn();
    mocks.headers = new Headers({ "x-drivebook-base-path": basePath });
    expect(await redirectOf(Home())).toBe(`${basePath}/account`);
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

  it("renders the account page for the signed-in user", async () => {
    signIn();
    const html = await render(createElement(Account));
    expect(html).toContain(`>${account.title}</h1>`);
    expect(html).toContain("prodaja@demo.si");
  });
});

it("reads the dealer name through the session's DealerContext", async () => {
  mocks.dealerSession = { ctx, user: { id: "u1", email: "a@b.si", role: "salesperson" } };
  mocks.getDealerName.mockResolvedValue("Avto Demo d.o.o.");
  await render(createElement(DealerAppLayout, { children: child }));
  expect(mocks.getDealerName).toHaveBeenCalledWith(ctx);
});
