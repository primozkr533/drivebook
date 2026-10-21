import { createElement } from "react";
import { prerender } from "react-dom/static";
import { createTranslator } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { messages } from "./i18n";
import DealerLoginPage, { generateMetadata as dealerMetadata } from "@/app/dealer-admin/login/page";
import BackofficeLoginPage, { generateMetadata as backofficeMetadata } from "@/app/backoffice/login/page";
import { loginAction, logoutAction } from "@/components/auth/actions";

// Server-side next-intl needs a Next request scope; feed it the real sl messages instead.
vi.mock("next-intl/server", () => ({
  getRequestConfig: <T>(fn: T) => fn,
  getTranslations: async (namespace: "auth") => {
    const { messages } = await import("./i18n");
    return createTranslator({ locale: "sl", messages, namespace });
  },
}));

const mocks = vi.hoisted(() => ({
  headers: new Headers(),
  session: null as unknown,
  dealerSession: null as unknown,
  login: vi.fn(),
  logout: vi.fn(),
  setSessionCookie: vi.fn(),
  clearSessionCookie: vi.fn(),
}));

vi.mock("next/headers", () => ({ headers: async () => mocks.headers }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  },
}));
vi.mock("@/server/auth/session", () => ({
  getCurrentSession: async () => mocks.session,
  getDealerContextFromSession: async () => mocks.dealerSession,
  setSessionCookie: mocks.setSessionCookie,
  clearSessionCookie: mocks.clearSessionCookie,
}));
vi.mock("@/server/auth/login", () => ({ login: mocks.login, logout: mocks.logout }));

beforeEach(() => {
  mocks.headers = new Headers();
  mocks.session = null;
  mocks.dealerSession = null;
  vi.clearAllMocks();
});

async function render(Page: () => React.ReactElement) {
  const { prelude } = await prerender(createElement(Page));
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

const auth = messages.auth;
const pages = [
  { name: "dealer-admin", Page: DealerLoginPage, metadata: dealerMetadata, title: auth.dealerTitle, eyebrow: auth.eyebrowDealer },
  { name: "backoffice", Page: BackofficeLoginPage, metadata: backofficeMetadata, title: auth.backofficeTitle, eyebrow: auth.eyebrowBackoffice },
];

describe.each(pages)("$name login page", ({ Page, metadata, title, eyebrow }) => {
  it("renders the title, eyebrow and labelled fields with stable test ids", async () => {
    const html = await render(Page);
    expect(html).toContain(`>${title}</h1>`);
    expect(html).toContain(eyebrow);
    expect(html).toMatch(new RegExp(`<label for="[^"]+"[^>]*>${auth.email}</label>`));
    expect(html).toMatch(new RegExp(`<label for="[^"]+"[^>]*>${auth.password}</label>`));
    expect(html).toMatch(/<input[^>]*type="email"[^>]*data-testid="login-email"/);
    expect(html).toMatch(/<input[^>]*type="password"[^>]*data-testid="login-password"/);
    expect(html).not.toContain("login-error");
    expect(html).not.toContain("login-totp");
  });

  it("has an enabled submit button wired to a server action", async () => {
    const html = await render(Page);
    expect(html).toMatch(/<form[^>]*action=/);
    const submit = html.match(/<button[^>]*data-testid="login-submit"[^>]*>/)?.[0];
    expect(submit).toContain('type="submit"');
    expect(submit).not.toContain(" disabled=");
    expect(html).toContain(`>${auth.submit}</button>`);
  });

  it("links to forgot-password on the same surface base path", async () => {
    mocks.headers = new Headers({ "x-drivebook-base-path": "/_dev/app" });
    const html = await render(Page);
    const link = html.match(/<a[^>]*href="\/_dev\/app\/forgot-password"[^>]*>([^<]*)<\/a>/);
    expect(link?.[1]).toBe(auth.forgotPassword);
  });

  it("redirects to the surface home when a session already exists", async () => {
    mocks.session = { session: {}, user: {} };
    mocks.dealerSession = { ctx: {}, user: {}, sessionId: "s" };
    mocks.headers = new Headers({ "x-drivebook-base-path": "/_dev/admin" });
    expect(await redirectOf(render(Page))).toBe("/_dev/admin/");
  });

  it("exports the translated metadata title", async () => {
    expect(await metadata()).toEqual({ title });
  });
});

describe("dealer login page with a session whose dealer is missing", () => {
  it("renders the form instead of redirecting to the admin home", async () => {
    mocks.session = { session: {}, user: {} };
    mocks.dealerSession = null;
    mocks.headers = new Headers({ "x-drivebook-base-path": "/_dev/app" });
    const html = await render(DealerLoginPage);
    expect(html).toMatch(/<input[^>]*type="email"[^>]*data-testid="login-email"/);
    expect(html).toContain(`>${auth.dealerTitle}</h1>`);
  });
});

describe("loginAction", () => {
  const form = (fields: Record<string, string>) => {
    const data = new FormData();
    for (const [k, v] of Object.entries(fields)) data.set(k, v);
    return data;
  };

  it("passes the form and the trusted (last) forwarded IP to login(), sets the cookie and redirects home", async () => {
    mocks.headers = new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1", "user-agent": "UA" });
    mocks.login.mockResolvedValue({ ok: true, token: "tok" });
    const url = await redirectOf(loginAction("dealer", { step: "password" }, form({ email: "a@b.si", password: "pw" })));
    expect(mocks.login).toHaveBeenCalledWith({
      surface: "dealer",
      email: "a@b.si",
      password: "pw",
      totpCode: undefined,
      pendingToken: undefined,
      ip: "10.0.0.1",
      userAgent: "UA",
    });
    expect(mocks.setSessionCookie).toHaveBeenCalledWith("dealer", "tok");
    expect(url).toBe("/");
  });

  it("returns the generic and rate-limit errors without setting a cookie", async () => {
    mocks.login.mockResolvedValueOnce({ ok: false, error: "invalid" });
    expect(await loginAction("backoffice", { step: "password" }, form({ email: "x@y.si" }))).toEqual({
      step: "password",
      email: "x@y.si",
      error: "invalid",
    });
    mocks.login.mockResolvedValueOnce({ ok: false, error: "rate_limited" });
    expect(await loginAction("backoffice", { step: "password" }, form({ email: "x@y.si" }))).toMatchObject({
      error: "rate_limited",
    });
    expect(mocks.setSessionCookie).not.toHaveBeenCalled();
  });

  it("moves to the code step and forwards the pending token and code", async () => {
    mocks.login.mockResolvedValueOnce({ ok: false, error: "totp_required", pendingToken: "p1" });
    expect(await loginAction("dealer", { step: "password" }, form({ email: "a@b.si", password: "pw" }))).toEqual({
      step: "totp",
      email: "a@b.si",
      pendingToken: "p1",
    });
    mocks.login.mockResolvedValueOnce({ ok: false, error: "totp_invalid", pendingToken: "p1" });
    const state = await loginAction("dealer", { step: "totp" }, form({ pendingToken: "p1", totpCode: "123456" }));
    expect(state).toEqual({ step: "totp", email: "", pendingToken: "p1", error: "totp_invalid" });
    expect(mocks.login).toHaveBeenLastCalledWith(expect.objectContaining({ pendingToken: "p1", totpCode: "123456" }));
  });
});

describe("logoutAction", () => {
  it("logs out, clears the cookie and redirects to the surface login", async () => {
    mocks.headers = new Headers({ "x-drivebook-base-path": "/_dev/app" });
    expect(await redirectOf(logoutAction("dealer"))).toBe("/_dev/app/login");
    expect(mocks.logout).toHaveBeenCalledWith("dealer");
    expect(mocks.clearSessionCookie).toHaveBeenCalledWith("dealer");
  });
});
