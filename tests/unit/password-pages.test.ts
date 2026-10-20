import { createElement, type FunctionComponent } from "react";
import { prerender } from "react-dom/static";
import { createTranslator } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { messages } from "./i18n";
import DealerSetPasswordPage from "@/app/dealer-admin/set-password/[token]/page";
import DealerResetPasswordPage from "@/app/dealer-admin/reset-password/[token]/page";
import DealerForgotPasswordPage from "@/app/dealer-admin/forgot-password/page";
import BackofficeSetPasswordPage from "@/app/backoffice/set-password/[token]/page";
import BackofficeResetPasswordPage from "@/app/backoffice/reset-password/[token]/page";
import BackofficeForgotPasswordPage from "@/app/backoffice/forgot-password/page";
import { forgotPasswordAction, setPasswordAction } from "@/components/auth/link-actions";

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
  inspectLinkToken: vi.fn(),
  consumeLinkToken: vi.fn(),
  requestPasswordReset: vi.fn(),
  setSessionCookie: vi.fn(),
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
}));
vi.mock("@/server/auth/links", () => ({
  inspectLinkToken: mocks.inspectLinkToken,
  consumeLinkToken: mocks.consumeLinkToken,
  requestPasswordReset: mocks.requestPasswordReset,
}));

beforeEach(() => {
  mocks.headers = new Headers();
  mocks.session = null;
  mocks.dealerSession = null;
  vi.clearAllMocks();
});

const auth = messages.auth;

async function render(Page: FunctionComponent<never>, props: object = {}) {
  const { prelude } = await prerender(createElement(Page as FunctionComponent<object>, props));
  return new Response(prelude).text();
}

const withToken = (token: string) => ({ params: Promise.resolve({ token }) });

async function redirectOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
  } catch (error) {
    return (error as { url?: string }).url;
  }
  return undefined;
}

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.set(k, v);
  return data;
};

const linkPages = [
  { name: "dealer set-password", Page: DealerSetPasswordPage, surface: "dealer", purpose: "invite", title: auth.setPasswordTitle, expired: auth.inviteExpired },
  { name: "backoffice set-password", Page: BackofficeSetPasswordPage, surface: "backoffice", purpose: "invite", title: auth.setPasswordTitle, expired: auth.inviteExpired },
  { name: "dealer reset-password", Page: DealerResetPasswordPage, surface: "dealer", purpose: "reset", title: auth.resetPasswordTitle, expired: auth.resetExpired },
  { name: "backoffice reset-password", Page: BackofficeResetPasswordPage, surface: "backoffice", purpose: "reset", title: auth.resetPasswordTitle, expired: auth.resetExpired },
] as const;

describe.each(linkPages)("$name page", ({ Page, surface, purpose, title, expired }) => {
  it("inspects the token and renders the labelled password form when valid", async () => {
    mocks.inspectLinkToken.mockResolvedValue("valid");
    const html = await render(Page, withToken("tok-1"));
    expect(mocks.inspectLinkToken).toHaveBeenCalledWith(surface, purpose, "tok-1");
    expect(html).toContain(`>${title}</h1>`);
    expect(html).toMatch(new RegExp(`<label for="[^"]+"[^>]*>${auth.newPassword}</label>`));
    expect(html).toMatch(new RegExp(`<label for="[^"]+"[^>]*>${auth.confirmPassword}</label>`));
    expect(html).toMatch(/<input[^>]*type="password"[^>]*data-testid="new-password"/);
    expect(html).toMatch(/<input[^>]*type="password"[^>]*data-testid="confirm-password"/);
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*data-testid="set-password-submit"/);
    expect(html).not.toContain("link-status");
  });

  it.each([
    ["expired", expired],
    ["used", auth.linkUsed],
    ["invalid", auth.linkInvalid],
  ])("shows the %s link-status message instead of the form", async (state, message) => {
    mocks.inspectLinkToken.mockResolvedValue(state);
    const html = await render(Page, withToken("tok-2"));
    expect(html).toMatch(new RegExp(`data-testid="link-status"[^>]*>${message}<`));
    expect(html).not.toContain("new-password");
  });
});

describe("link-status links", () => {
  it("points an expired reset link to forgot-password and other states to login", async () => {
    mocks.headers = new Headers({ "x-drivebook-base-path": "/_dev/admin" });
    mocks.inspectLinkToken.mockResolvedValue("expired");
    const reset = await render(BackofficeResetPasswordPage, withToken("t"));
    expect(reset).toMatch(new RegExp(`href="/_dev/admin/forgot-password"[^>]*>${auth.requestNewLink}<`));

    mocks.inspectLinkToken.mockResolvedValue("used");
    const used = await render(BackofficeSetPasswordPage, withToken("t"));
    expect(used).toMatch(new RegExp(`href="/_dev/admin/login"[^>]*>${auth.backToLogin}<`));
  });
});

describe("setPasswordAction", () => {
  it("rejects a too-short password and a mismatch inline without consuming the token", async () => {
    expect(await setPasswordAction("dealer", "invite", "t", {}, form({ password: "kratko", confirm: "kratko" }))).toEqual({
      error: "too_short",
    });
    expect(
      await setPasswordAction("dealer", "invite", "t", {}, form({ password: "dolgo-geslo-1", confirm: "dolgo-geslo-2" })),
    ).toEqual({ error: "mismatch" });
    expect(mocks.consumeLinkToken).not.toHaveBeenCalled();
  });

  it("consumes the token, sets the session cookie and redirects to the surface home", async () => {
    mocks.headers = new Headers({ "x-forwarded-for": "203.0.113.9", "user-agent": "UA", "x-drivebook-base-path": "/_dev/app" });
    mocks.consumeLinkToken.mockResolvedValue({ ok: true, sessionToken: "sess" });
    const url = await redirectOf(
      setPasswordAction("dealer", "reset", "t", {}, form({ password: "dolgo-geslo-1", confirm: "dolgo-geslo-1" })),
    );
    expect(mocks.consumeLinkToken).toHaveBeenCalledWith("dealer", "reset", "t", "dolgo-geslo-1", {
      ip: "203.0.113.9",
      userAgent: "UA",
    });
    expect(mocks.setSessionCookie).toHaveBeenCalledWith("dealer", "sess");
    expect(url).toBe("/_dev/app/");
  });

  it("returns the link state when the token went stale before submit", async () => {
    mocks.consumeLinkToken.mockResolvedValue({ ok: false, error: "used" });
    expect(
      await setPasswordAction("backoffice", "invite", "t", {}, form({ password: "dolgo-geslo-1", confirm: "dolgo-geslo-1" })),
    ).toEqual({ status: "used" });
    expect(mocks.setSessionCookie).not.toHaveBeenCalled();
  });
});

describe.each([
  { name: "dealer", Page: DealerForgotPasswordPage, surface: "dealer" },
  { name: "backoffice", Page: BackofficeForgotPasswordPage, surface: "backoffice" },
] as const)("$name forgot-password", ({ Page, surface }) => {
  it("renders a labelled e-mail field and submit", async () => {
    const html = await render(Page);
    expect(html).toContain(`>${auth.forgotTitle}</h1>`);
    expect(html).toMatch(/<input[^>]*type="email"[^>]*data-testid="forgot-email"/);
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*data-testid="forgot-submit"/);
  });

  it("redirects to the surface home when signed in", async () => {
    mocks.session = { session: {}, user: {} };
    mocks.dealerSession = { ctx: {}, user: {}, sessionId: "s" };
    mocks.headers = new Headers({ "x-drivebook-base-path": "/_dev/app" });
    expect(await redirectOf(render(Page))).toBe("/_dev/app/");
  });

  it("returns the same confirmation state whatever the e-mail", async () => {
    for (const email of ["obstaja@drivebook.si", "ne-obstaja@drivebook.si"]) {
      expect(await forgotPasswordAction(surface, { sent: false }, form({ email }))).toEqual({ sent: true });
      expect(mocks.requestPasswordReset).toHaveBeenLastCalledWith(surface, email);
    }
  });
});

describe("dealer forgot-password with a session whose dealer is missing", () => {
  it("renders the form instead of redirecting to the admin home", async () => {
    mocks.session = { session: {}, user: {} };
    mocks.dealerSession = null;
    const html = await render(DealerForgotPasswordPage);
    expect(html).toMatch(/<input[^>]*type="email"[^>]*data-testid="forgot-email"/);
  });
});
