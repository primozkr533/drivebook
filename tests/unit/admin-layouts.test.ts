import { createElement, type ReactNode } from "react";
import { prerender } from "react-dom/static";
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { messages } from "./i18n";
import DealerAppLayout from "@/app/dealer-admin/(app)/layout";
import DealerHomePage from "@/app/dealer-admin/(app)/page";
import DealerAccountPage from "@/app/dealer-admin/(app)/account/page";
import BackofficeAppLayout from "@/app/backoffice/(app)/layout";
import BackofficeHomePage from "@/app/backoffice/(app)/page";
import BackofficeAccountPage from "@/app/backoffice/(app)/account/page";
import BackofficeDealersPage from "@/app/backoffice/(app)/dealers/page";
import BackofficeNewDealerPage from "@/app/backoffice/(app)/dealers/new/page";
import BackofficePlansPage from "@/app/backoffice/(app)/plans/page";
import BackofficePlanPage from "@/app/backoffice/(app)/plans/[id]/page";
import BackofficeNewPlanPage from "@/app/backoffice/(app)/plans/new/page";
import BackofficeUsersPage from "@/app/backoffice/(app)/users/page";
import { requireOwnerPage } from "@/app/dealer-admin/(app)/owner-gate";
import { BOOKING_RULE_DEFAULTS } from "@/server/data/settings-booking";
import SettingsLayout from "@/app/dealer-admin/(app)/settings/layout";
import SettingsHomePage from "@/app/dealer-admin/(app)/settings/page";
import SettingsDealerPage from "@/app/dealer-admin/(app)/settings/dealer/page";
import SettingsBrandingPage from "@/app/dealer-admin/(app)/settings/branding/page";
import SettingsBookingPage from "@/app/dealer-admin/(app)/settings/booking/page";
import SettingsHoursPage from "@/app/dealer-admin/(app)/settings/hours/page";
import SettingsClosuresPage from "@/app/dealer-admin/(app)/settings/closures/page";
import DealerUsersPage from "@/app/dealer-admin/(app)/users/page";

vi.mock("next-intl/server", () => ({
  getRequestConfig: <T>(fn: T) => fn,
  getTranslations: async (
    namespace: "auth" | "account" | "backoffice" | "settings" | "settingsBooking" | "settingsDealer",
  ) => {
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
  listPlans: vi.fn(),
  getPlan: vi.fn(),
  listBackofficeUsers: vi.fn(),
  getOpeningHours: vi.fn(),
  getBranding: vi.fn(),
  getBookingRules: vi.fn(),
  getDealerSettings: vi.fn(),
  pathname: "/",
}));

vi.mock("next/headers", () => ({ headers: async () => mocks.headers }));
vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  redirect: (url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
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
vi.mock("@/server/data/settings-dealer", () => ({
  getDealerSettings: mocks.getDealerSettings,
  updateDealerProfile: vi.fn(),
  updateSmsSettings: vi.fn(),
}));
vi.mock("@/server/data/backoffice/dealers", () => ({ listDealers: mocks.listDealers, createDealer: vi.fn() }));
vi.mock("@/server/data/settings-hours", () => ({ getOpeningHours: mocks.getOpeningHours }));
vi.mock("@/server/data/settings-branding", () => ({ getBranding: mocks.getBranding, MAX_LOGO_BYTES: 2 * 1024 * 1024 }));
vi.mock("@/app/dealer-admin/(app)/settings/branding/actions", () => ({ saveLogoAction: vi.fn(), savePrimaryColorAction: vi.fn() }));
vi.mock("@/app/dealer-admin/(app)/settings/hours/actions", () => ({ saveOpeningHoursAction: vi.fn() }));
vi.mock("@/server/data/backoffice/plans", () => ({
  listPlans: mocks.listPlans,
  getPlan: mocks.getPlan,
  createPlan: vi.fn(),
  updatePlan: vi.fn(),
  deletePlan: vi.fn(),
  DEFAULT_MONTHLY_SMS_QUOTA: 300,
}));
vi.mock("@/server/data/settings-booking", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/data/settings-booking")>()),
  getBookingRules: mocks.getBookingRules,
}));
vi.mock("@/server/data/backoffice/users", () => ({
  listBackofficeUsers: mocks.listBackofficeUsers,
  inviteBackofficeUser: vi.fn(),
  deactivateBackofficeUser: vi.fn(),
}));

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
const plansT = messages.backoffice.plans;
const usersT = messages.backoffice.users;
const child = createElement("p", { "data-testid": "child" }, "vsebina");

const surfaces = [
  {
    name: "dealer-admin",
    Layout: DealerAppLayout,
    Home: DealerHomePage,
    Account: DealerAccountPage,
    alias: "/_dev/app",
    home: ["", "account"].join("/"),
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
    home: ["", "dealers"].join("/"),
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
    expect(html).toMatch(/<a[^>]*href="\/dealers\/d1"[^>]*data-testid="dealer-row-link"/);
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

  it("shows the Nov trgovec signal link to a Superadmin only", async () => {
    mocks.listDealers.mockResolvedValue([]);
    mocks.headers = new Headers({ "x-drivebook-base-path": "/_dev/admin" });
    mocks.backofficeSession = { session: {}, user: { id: "u1", email: "root@drivebook.si", role: "superadmin" } };
    const html = await renderDealers();
    expect(html).toMatch(/<a[^>]*bg-signal[^>]*href="\/_dev\/admin\/dealers\/new"[^>]*data-testid="dealer-create"[^>]*>Nov trgovec<\/a>/);
    signInBackoffice();
    expect(await renderDealers()).not.toContain("dealer-create");
  });

  it("renders the create-dealer form for a Superadmin with plans and the slug help text", async () => {
    mocks.headers = new Headers({ "x-drivebook-base-path": "/_dev/admin" });
    mocks.backofficeSession = { session: {}, user: { id: "u1", email: "root@drivebook.si", role: "superadmin" } };
    mocks.listPlans.mockResolvedValue([
      { id: "p2", code: "pro", name: "Pro", isDefault: false },
      { id: "p1", code: "osnovni", name: "Osnovni", isDefault: true },
    ]);
    const html = await render(createElement(BackofficeNewDealerPage));
    for (const name of ["name", "slug", "ownerEmail", "licenceValidUntil", "notes"]) {
      expect(html).toMatch(new RegExp(`<input[^>]*name="${name}"`));
    }
    expect(html).toMatch(/<input[^>]*type="date"[^>]*name="licenceValidUntil"/);
    expect(html).toMatch(/<select[^>]*name="planId"/);
    expect(html).toMatch(/<option value="p1" selected="">Osnovni<\/option>/);
    expect(html).toContain(dealersT.new.hints.slug);
    expect(html.match(/bg-signal/g)).toHaveLength(1);
  });

  it("redirects Support from the create-dealer page to the list", async () => {
    signInBackoffice();
    mocks.headers = new Headers({ "x-drivebook-base-path": "/_dev/admin" });
    expect(await redirectOf(render(createElement(BackofficeNewDealerPage)))).toBe("/_dev/admin/dealers");
    expect(mocks.listPlans).not.toHaveBeenCalled();
  });

  it("ignores an unknown status filter", async () => {
    signInBackoffice();
    mocks.listDealers.mockResolvedValue([]);
    await renderDealers({ status: "deleted" });
    expect(mocks.listDealers).toHaveBeenCalledWith({ q: undefined, status: undefined });
  });
});

describe("backoffice plans", () => {
  const signInAs = (role: "superadmin" | "support") => {
    mocks.backofficeSession = { session: {}, user: { id: "u2", email: "ops@drivebook.si", role } };
    mocks.headers = new Headers({ "x-drivebook-base-path": "/_dev/admin" });
  };
  const plans = [
    { id: "p1", code: "osnovni", name: "Osnovni", monthlySmsQuota: 300, maxUsers: 3, notes: null, isDefault: true, dealerCount: 2 },
    { id: "p2", code: "pro", name: "Pro", monthlySmsQuota: 1000, maxUsers: 10, notes: "Za večje salone", isDefault: false, dealerCount: 0 },
  ];
  const renderPlan = (id: string) => render(createElement(BackofficePlanPage, { params: Promise.resolve({ id }), searchParams: Promise.resolve({}) }));

  it.each(["", "/_dev/admin"])("marks Paketi active in the inline nav and the compact menu (base path %j)", async (basePath) => {
    signInAs("support");
    mocks.headers = new Headers({ "x-drivebook-base-path": basePath });
    mocks.pathname = `${basePath}/plans/p1`;
    const html = await render(createElement(BackofficeAppLayout, { children: child }));
    const links = html.match(new RegExp(`<a[^>]*href="${basePath}/plans"[^>]*>${plansT.nav}</a>`, "g")) ?? [];
    expect(links).toHaveLength(2);
    for (const a of links) expect(a).toContain('aria-current="page"');
  });

  it("lists plans with quota, max users, dealer count and notes, and a create link for a Superadmin", async () => {
    signInAs("superadmin");
    mocks.listPlans.mockResolvedValue(plans);
    const html = await render(createElement(BackofficePlansPage));
    expect(html.match(/data-testid="plan-row"/g)).toHaveLength(2);
    for (const text of [">Osnovni<", ">300<", ">3<", ">2<", plansT.noNotes, ">Pro<", ">1000<", ">10<", "Za večje salone", plansT.default]) {
      expect(html).toContain(text);
    }
    expect(html).toMatch(/<a[^>]*href="\/_dev\/admin\/plans\/new"[^>]*data-testid="plan-create"/);
    expect(html).toMatch(/href="\/_dev\/admin\/plans\/p2"/);
  });

  it("hides the create control from Support", async () => {
    signInAs("support");
    mocks.listPlans.mockResolvedValue(plans);
    const html = await render(createElement(BackofficePlansPage));
    expect(html.match(/data-testid="plan-row"/g)).toHaveLength(2);
    expect(html).not.toContain('data-testid="plan-create"');
  });

  it("prefills the new-plan form with a 300 SMS quota", async () => {
    signInAs("superadmin");
    const html = await render(createElement(BackofficeNewPlanPage));
    for (const name of ["name", "maxUsers", "notes"]) expect(html).toMatch(new RegExp(`<input[^>]*name="${name}"`));
    expect(html).toMatch(/<input[^>]*name="monthlySmsQuota"[^>]*value="300"/);
    expect(html).toContain(`>${plansT.fields.monthlySmsQuota}</label>`);
    expect(html).toContain('data-testid="plan-submit"');
  });

  it("sends Support away from the new-plan page", async () => {
    signInAs("support");
    expect(await redirectOf(render(createElement(BackofficeNewPlanPage)))).toBe("/_dev/admin/plans");
  });

  it("shows the edit and delete forms to a Superadmin", async () => {
    signInAs("superadmin");
    mocks.getPlan.mockResolvedValue(plans[1]);
    const html = await renderPlan("p2");
    expect(mocks.getPlan).toHaveBeenCalledWith("p2");
    expect(html).toMatch(/<input[^>]*name="name"[^>]*value="Pro"/);
    expect(html).toMatch(/<input[^>]*name="monthlySmsQuota"[^>]*value="1000"/);
    expect(html).toMatch(/<input[^>]*name="maxUsers"[^>]*value="10"/);
    expect(html).toMatch(/<input[^>]*name="notes"[^>]*value="Za večje salone"/);
    expect(html).toContain('data-testid="plan-delete"');
    expect(html).not.toContain('data-testid="plan-readonly"');
  });

  it("shows Support read-only values without edit or delete controls", async () => {
    signInAs("support");
    mocks.getPlan.mockResolvedValue(plans[1]);
    const html = await renderPlan("p2");
    expect(html).toContain('data-testid="plan-readonly"');
    expect(html).toMatch(/data-testid="plan-value-monthlySmsQuota"[^>]*>1000</);
    expect(html).toMatch(/data-testid="plan-value-notes"[^>]*>Za večje salone</);
    expect(html).not.toContain("<form");
    expect(html).not.toContain("<input");
  });

  it("404s an unknown plan", async () => {
    signInAs("superadmin");
    mocks.getPlan.mockResolvedValue(null);
    await expect(renderPlan("missing")).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

describe("backoffice users", () => {
  const signInAs = (role: "superadmin" | "support") => {
    mocks.backofficeSession = { session: {}, user: { id: "u2", email: "ops@drivebook.si", role } };
    mocks.headers = new Headers({ "x-drivebook-base-path": "/_dev/admin" });
  };
  const users = [
    { id: "u2", email: "ops@drivebook.si", role: "superadmin", status: "active" },
    { id: "u3", email: "nova@drivebook.si", role: "support", status: "invited" },
    { id: "u4", email: "pomoc@drivebook.si", role: "support", status: "active" },
    { id: "u5", email: "stari@drivebook.si", role: "support", status: "deactivated" },
  ];
  const rowOf = (html: string, email: string) =>
    html.split("<tr").find((row) => row.includes('data-testid="user-row"') && row.includes(email)) ?? "";

  it.each(["", "/_dev/admin"])("marks Uporabniki active in the inline nav and the compact menu (base path %j)", async (basePath) => {
    signInAs("support");
    mocks.headers = new Headers({ "x-drivebook-base-path": basePath });
    mocks.pathname = `${basePath}/users`;
    const html = await render(createElement(BackofficeAppLayout, { children: child }));
    const links = html.match(new RegExp(`<a[^>]*href="${basePath}/users"[^>]*>${usersT.nav}</a>`, "g")) ?? [];
    expect(links).toHaveLength(2);
    for (const a of links) expect(a).toContain('aria-current="page"');
  });

  it("lists users with role and status badges, the invite form and deactivate buttons for a Superadmin", async () => {
    signInAs("superadmin");
    mocks.listBackofficeUsers.mockResolvedValue(users);
    const html = await render(createElement(BackofficeUsersPage));
    expect(html.match(/data-testid="user-row"/g)).toHaveLength(4);
    const labels = [usersT.roles.superadmin, usersT.roles.support, usersT.statuses.active, usersT.statuses.invited, usersT.statuses.deactivated];
    for (const text of labels) expect(html).toContain(`>${text}<`);
    expect(html).toMatch(/<input[^>]*name="email"/);
    expect(html).toContain(`>${usersT.fields.email}</label>`);
    expect(html).toMatch(/<select[^>]*name="role"/);
    expect(html).toContain(`>${usersT.fields.role}</label>`);
    expect(html.match(/data-testid="user-deactivate"/g)).toHaveLength(2);
    expect(rowOf(html, "nova@drivebook.si")).toContain(`>${usersT.deactivate}<`);
    expect(rowOf(html, "pomoc@drivebook.si")).toContain('data-testid="user-deactivate"');
    expect(rowOf(html, "ops@drivebook.si")).not.toContain('data-testid="user-deactivate"');
    expect(rowOf(html, "stari@drivebook.si")).not.toContain('data-testid="user-deactivate"');
  });

  it("shows Support the list without the invite form or deactivate buttons", async () => {
    signInAs("support");
    mocks.listBackofficeUsers.mockResolvedValue(users);
    const html = await render(createElement(BackofficeUsersPage));
    expect(html.match(/data-testid="user-row"/g)).toHaveLength(4);
    expect(html).not.toContain("<form");
    expect(html).not.toContain('data-testid="user-deactivate"');
  });

  it("redirects to the login page without a session", async () => {
    mocks.headers = new Headers({ "x-drivebook-base-path": "/_dev/admin" });
    expect(await redirectOf(render(createElement(BackofficeUsersPage)))).toBe("/_dev/admin/login");
    expect(mocks.listBackofficeUsers).not.toHaveBeenCalled();
  });
});

describe("dealer settings shell", () => {
  const settingsT = messages.settings;
  const owner = { id: "u1", email: "lastnik@demo.si", role: "owner" };
  const salesperson = { id: "u3", email: "prodajalec@demo.si", role: "salesperson" };
  const signInAs = (user: typeof owner, basePath = "/_dev/app") => {
    mocks.getBookingRules.mockResolvedValue({ ...BOOKING_RULE_DEFAULTS });
    mocks.dealerSession = { ctx, user, sessionId: "s1" };
    mocks.getDealerName.mockResolvedValue("Avto Demo d.o.o.");
    mocks.headers = new Headers({ "x-drivebook-base-path": basePath });
  };
  const sections = ["dealer", "branding", "booking", "hours", "closures"] as const;
  const stubSections = ["branding", "booking", "hours", "closures"] as const;
  const stubPages = [SettingsBrandingPage, SettingsBookingPage, SettingsHoursPage, SettingsClosuresPage];
  const navLink = (href: string, label: string) => new RegExp(`<a[^>]*href="${href}"[^>]*>${label}</a>`, "g");

  it("requireOwnerPage returns the session for an Owner and denies a Salesperson of the same dealer", async () => {
    signInAs(owner);
    expect(await requireOwnerPage()).toEqual({ ok: true, ctx, user: owner });
    signInAs(salesperson);
    expect(await requireOwnerPage()).toEqual({ ok: false });
  });

  it("requireOwnerPage redirects to the login page without a session", async () => {
    mocks.headers = new Headers({ "x-drivebook-base-path": "/_dev/app" });
    expect(await redirectOf(requireOwnerPage())).toBe("/_dev/app/login");
  });

  it.each(["", "/_dev/app"])("shows Settings and Users in the inline nav and the compact menu for an Owner (base path %j)", async (basePath) => {
    signInAs(owner, basePath);
    const html = await render(createElement(DealerAppLayout, { children: child }));
    expect(html.match(navLink(`${basePath}/settings`, settingsT.nav))).toHaveLength(2);
    expect(html.match(navLink(`${basePath}/users`, settingsT.usersNav))).toHaveLength(2);
  });

  it("hides Settings and Users from a Salesperson", async () => {
    signInAs(salesperson);
    const html = await render(createElement(DealerAppLayout, { children: child }));
    expect(html).not.toContain(`>${settingsT.nav}</a>`);
    expect(html).not.toContain(`>${settingsT.usersNav}</a>`);
    expect(html.match(navLink("/_dev/app/account", messages.account.navAccount))).toHaveLength(2);
  });

  it.each([
    ["settings", ["", "settings", "hours"].join("/")],
    ["users", ["", "users"].join("/")],
  ])("marks the %s nav item active", async (item, path) => {
    signInAs(owner);
    mocks.pathname = `/_dev/app${path}`;
    const label = item === "users" ? settingsT.usersNav : settingsT.nav;
    const links = (await render(createElement(DealerAppLayout, { children: child }))).match(navLink(`/_dev/app/${item}`, label)) ?? [];
    expect(links).toHaveLength(2);
    for (const a of links) expect(a).toContain('aria-current="page"');
  });

  it("renders the settings header and sub-nav with the current section active for an Owner", async () => {
    signInAs(owner);
    mocks.pathname = "/_dev/app/settings/booking";
    const html = await render(createElement(SettingsLayout, { children: child }));
    expect(html).toContain(`>${settingsT.title}</h1>`);
    expect(html).toContain('data-testid="child"');
    for (const section of sections) {
      const links = html.match(new RegExp(`<a[^>]*href="/_dev/app/settings/${section}"[^>]*>`, "g")) ?? [];
      expect(links).toHaveLength(1);
      expect(html).toContain(settingsT.sections[section]);
      if (section === "booking") expect(links[0]).toContain('aria-current="page"');
      else expect(links[0]).not.toContain("aria-current");
    }
  });

  it("denies a Salesperson in the settings layout without rendering the children", async () => {
    signInAs(salesperson);
    const html = await render(createElement(SettingsLayout, { children: child }));
    expect(html).toContain('data-testid="access-denied"');
    expect(html).toContain(settingsT.accessDenied.title);
    expect(html).not.toContain('data-testid="child"');
    expect(html).not.toContain('data-testid="settings-nav"');
    expect(html).not.toContain(settingsT.title + "</h1>");
  });

  it.each(["", "/_dev/app"])("redirects the settings home to the dealer section (base path %j)", async (basePath) => {
    signInAs(owner, basePath);
    expect(await redirectOf(render(createElement(SettingsHomePage)))).toBe(`${basePath}/settings/dealer`);
  });

  it("renders every remaining settings page for an Owner and access denied for a Salesperson", async () => {
    const testIds: Record<(typeof stubSections)[number], string> = {
      branding: "settings-branding",
      booking: "settings-booking",
      hours: "hours-editor",
      closures: "settings-closures",
    };
    mocks.getOpeningHours.mockResolvedValue({ 1: [{ opens: "08:00", closes: "12:00" }], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] });
    mocks.getBranding.mockResolvedValue({ primaryColor: "#E4572E", logoUrl: "/api/files/logos/abc.png" });
    const renderPage = async (Page: (typeof stubPages)[number]) =>
      render(createElement(NextIntlClientProvider, { locale: "sl", messages, timeZone: "Europe/Ljubljana", children: await Page() }));
    for (const [i, Page] of stubPages.entries()) {
      signInAs(owner);
      const html = await renderPage(Page);
      expect(html).toContain(`data-testid="${testIds[stubSections[i]]}"`);
      expect(html).not.toContain("access-denied");

      signInAs(salesperson);
      const calls = mocks.getOpeningHours.mock.calls.length;
      const denied = await renderPage(Page);
      expect(denied).toContain('data-testid="access-denied"');
      expect(denied).not.toContain(testIds[stubSections[i]]);
      expect(mocks.getOpeningHours.mock.calls.length).toBe(calls);
    }
    signInAs(salesperson);
    expect(await render(createElement(SettingsHomePage))).toContain('data-testid="access-denied"');
  });

  it("renders the dealer data and SMS forms for an Owner and access denied for a Salesperson", async () => {
    const t = messages.settingsDealer;
    mocks.getDealerSettings.mockResolvedValue({
      name: "Avto Demo d.o.o.",
      addressLine: "Dunajska 1",
      postalCode: "1000",
      city: "Ljubljana",
      phone: "+38611234567",
      email: "info@demo.si",
      googleMapsUrl: null,
      privacyPolicyUrl: null,
      smsSenderName: null,
      effectiveSmsSenderName: "Avto Demo d",
      smsNotificationsEnabled: true,
      notificationPhone: "+38641555218",
    });
    signInAs(owner);
    const page = await SettingsDealerPage();
    const html = await render(
      createElement(NextIntlClientProvider, { locale: "sl", messages, timeZone: "Europe/Ljubljana", children: page }),
    );
    expect(mocks.getDealerSettings).toHaveBeenCalledWith(ctx);
    expect(html).toContain('class="grid grid-cols-1 lg:grid-cols-2');
    for (const text of [t.profile.title, t.sms.title, t.profile.fields.googleMapsUrl, t.sms.fields.smsSenderName, ">0/11<"]) {
      expect(html).toContain(text);
    }
    for (const field of ["name", "addressLine", "postalCode", "city", "phone", "email", "googleMapsUrl", "privacyPolicyUrl",
      "smsSenderName", "smsNotificationsEnabled", "notificationPhone"]) {
      expect(html).toContain(`name="${field}"`);
    }
    expect(html).toContain('placeholder="Avto Demo d"');
    expect(html).toContain('value="info@demo.si"');
    expect(html).toMatch(/name="smsNotificationsEnabled"[^>]*checked/);

    signInAs(salesperson);
    mocks.getDealerSettings.mockClear();
    const denied = await render(createElement(SettingsDealerPage));
    expect(denied).toContain('data-testid="access-denied"');
    expect(denied).not.toContain("settings-dealer-profile");
    expect(mocks.getDealerSettings).not.toHaveBeenCalled();
  });

  it("renders the users stub for an Owner and access denied for a Salesperson", async () => {
    signInAs(owner);
    const html = await render(createElement(DealerUsersPage));
    expect(html).toContain(`>${settingsT.users.title}</h1>`);
    expect(html).toContain('data-testid="dealer-users"');

    signInAs(salesperson);
    const denied = await render(createElement(DealerUsersPage));
    expect(denied).toContain('data-testid="access-denied"');
    expect(denied).not.toContain("dealer-users");
    expect(denied).not.toContain(settingsT.users.title + "</h1>");
  });

  it("shows the booking rules form with the current values, hours for notice and cut-off", async () => {
    signInAs(owner);
    mocks.getBookingRules.mockResolvedValue({ ...BOOKING_RULE_DEFAULTS, minNoticeMinutes: 180 });
    const html = await render(createElement(SettingsBookingPage));
    const bookingT = messages.settingsBooking;
    const value = (name: string) => html.match(new RegExp(`<input[^>]*name="${name}"[^>]*>`))?.[0].match(/value="([^"]*)"/)?.[1];
    expect(mocks.getBookingRules).toHaveBeenCalledWith(ctx);
    expect(value("testDriveMinutes")).toBe("45");
    expect(value("viewingMinutes")).toBe("30");
    expect(value("otherMinutes")).toBe("30");
    expect(value("capacity")).toBe("1");
    expect(value("minNoticeHours")).toBe("3");
    expect(value("horizonDays")).toBe("14");
    expect(value("bufferMinutes")).toBe("15");
    expect(value("cancelCutoffHours")).toBe("2");
    expect(html).toMatch(/<option value="15" selected="">15 min<\/option>/);
    expect(html).toContain(bookingT.fields.minNoticeHours);
    expect(html).toContain("0–168 h");
    expect(html).toContain("15–240 min");
    expect(html).toContain(bookingT.reset);
  });
});
