// The renamed-slug case uses the real test database: start Postgres with `docker compose up -d db`.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { dealers, dealerSlugHistory, plans } from "@/db/schema";
import { setDbForTests } from "@/server/data/db";
import { resolveDealerSlug, type ResolvedDealerSlug } from "@/server/data/dealers";
import {
  FILES_PATH_PREFIX,
  NOT_FOUND_PATH,
  requestHost,
  routeRequest,
  TEST_LOGIN_PATH,
  sessionCookieSecure,
  testLoginRedirect,
  type RouteConfig,
} from "@/server/routing";
import { getTestDb, truncateAll } from "../setup/db";

function config(overrides: Partial<RouteConfig> = {}): RouteConfig {
  return {
    baseDomain: "drivebook.localhost",
    devAliases: true,
    resolveSlug: vi.fn(async (): Promise<ResolvedDealerSlug> => ({ kind: "unknown" })),
    ...overrides,
  };
}

const route = (host: string, url: string, cfg = config()) => {
  const [pathname, query] = url.split("?");
  return routeRequest(host, pathname, query === undefined ? "" : `?${query}`, cfg);
};

const notFound = (search = "") => ({ kind: "rewrite", pathname: NOT_FOUND_PATH, search });

// Paths that must not resolve are built from segments so route crawlers do not pick them up as pages.
const path = (...segments: string[]) => ["", ...segments].join("/");

describe("requestHost", () => {
  it("prefers x-forwarded-host over host", () => {
    expect(requestHost(new Headers({ host: "web:3000", "x-forwarded-host": "demo.drivebook.si, proxy" }))).toBe(
      "demo.drivebook.si",
    );
    expect(requestHost(new Headers({ host: "localhost:3000" }))).toBe("localhost:3000");
  });
});

describe("routeRequest: hosts", () => {
  it("rewrites a dealer host to /site/{slug}{path} with an empty base path", async () => {
    expect(await route("demo.drivebook.localhost", "/")).toEqual({
      kind: "rewrite",
      pathname: "/site/demo/",
      search: "",
      headers: { "x-drivebook-base-path": "" },
    });
    expect(await route("demo.drivebook.localhost:3000", path("zasebnost"))).toMatchObject({
      pathname: "/site/demo/zasebnost",
    });
  });

  it("keeps the query string on a dealer rewrite", async () => {
    expect(await route("demo.drivebook.localhost", "/?car=abc")).toMatchObject({
      kind: "rewrite",
      pathname: "/site/demo/",
      search: "?car=abc",
    });
  });

  it("normalises case and port, and rewrites unknown slugs to the site page", async () => {
    const cfg = config();
    expect(await route("DEMO.DriveBook.localhost:3000", "/", cfg)).toMatchObject({ pathname: "/site/demo/" });
    expect(cfg.resolveSlug).toHaveBeenCalledWith("demo");
  });

  it("rewrites app. and admin. roots to the surface home with an empty base path", async () => {
    const empty = { "x-drivebook-base-path": "" };
    expect(await route("app.drivebook.localhost", "/")).toEqual({
      kind: "rewrite",
      pathname: "/dealer-admin/",
      search: "",
      headers: empty,
    });
    expect(await route("admin.drivebook.localhost", "/")).toEqual({
      kind: "rewrite",
      pathname: "/backoffice/",
      search: "",
      headers: empty,
    });
    expect(await route("app.drivebook.localhost", path("login"))).toEqual({
      kind: "rewrite",
      pathname: "/dealer-admin/login",
      search: "",
      headers: empty,
    });
    expect(await route("admin.drivebook.localhost", `${path("login")}?next=x`)).toEqual({
      kind: "rewrite",
      pathname: "/backoffice/login",
      search: "?next=x",
      headers: empty,
    });
    expect(await route("app.drivebook.localhost", path("account"))).toMatchObject({
      pathname: "/dealer-admin/account",
      headers: empty,
    });
  });

  it("passes the root hosts through", async () => {
    for (const host of ["localhost:3000", "drivebook.localhost", "127.0.0.1:3000"]) {
      expect(await route(host, "/")).toEqual({ kind: "next" });
      expect(await route(host, "/design")).toEqual({ kind: "next" });
    }
  });

  it("uses the configured base domain", async () => {
    const cfg = config({ baseDomain: "drivebook.si" });
    expect(await route("demo.drivebook.si", "/", cfg)).toMatchObject({ pathname: "/site/demo/" });
    expect(await route("drivebook.si", "/", cfg)).toEqual({ kind: "next" });
  });
});

describe("routeRequest: 404s and isolation", () => {
  it("404s reserved and invalid labels without calling the slug resolver", async () => {
    const cfg = config();
    for (const host of [
      "www.drivebook.localhost",
      "api.drivebook.localhost",
      "demo-admin.drivebook.localhost",
      "static.drivebook.localhost",
      "a.b.drivebook.localhost",
      "under_score.drivebook.localhost",
      `${"a".repeat(64)}.drivebook.localhost`,
    ]) {
      expect(await route(host, "/?car=1", cfg)).toEqual(notFound("?car=1"));
    }
    expect(cfg.resolveSlug).not.toHaveBeenCalled();
  });

  it("404s the internal prefixes on the root host without dev aliases", async () => {
    const off = config({ devAliases: false });
    expect(await route("localhost", "/site/demo", off)).toEqual(notFound());
    expect(await route("localhost", "/backoffice/login", off)).toEqual(notFound());
    expect(await route("localhost:3000", "/dealer-admin/login", off)).toEqual(notFound());
    expect(await route("localhost", "/dev", off)).toEqual(notFound());
    expect(await route("localhost", path("sitemap.xml"))).toEqual({ kind: "next" });
  });

  it("redirects the internal prefixes on a dev root host to their aliases", async () => {
    const redirect = (location: string) => ({ kind: "redirect", status: 307, location });
    expect(await route("localhost", "/site/demo?car=1")).toEqual(redirect("/_dev/site/demo?car=1"));
    expect(await route("web:3000", "/backoffice")).toEqual(redirect("/_dev/admin"));
    expect(await route("web:3000", "/backoffice/login")).toEqual(redirect("/_dev/admin/login"));
    expect(await route("localhost:3000", "/dealer-admin/login")).toEqual(redirect("/_dev/app/login"));
  });

  it("keeps each surface's routes unreachable from the other hosts", async () => {
    const cfg = config();
    expect(await route("demo.drivebook.localhost", "/dealer-admin/login", cfg)).toEqual(notFound());
    expect(await route("demo.drivebook.localhost", "/backoffice/login", cfg)).toEqual(notFound());
    expect(await route("app.drivebook.localhost", "/backoffice/login")).toEqual(notFound());
    expect(await route("app.drivebook.localhost", "/site/demo")).toEqual(notFound());
    expect(await route("admin.drivebook.localhost", "/dealer-admin/login")).toEqual(notFound());
    expect(await route("localhost", "/_dev/app/backoffice/login")).toEqual({
      kind: "redirect",
      status: 307,
      location: "/backoffice/login",
    });
    expect(cfg.resolveSlug).not.toHaveBeenCalled();
  });
});

describe("routeRequest: stored files", () => {
  const file = `${FILES_PATH_PREFIX}logos/abc123.png`;

  it("passes /api/files/* through untouched on every host", async () => {
    for (const host of [
      "demo.drivebook.localhost",
      "demo.drivebook.localhost:3000",
      "app.drivebook.localhost",
      "admin.drivebook.localhost",
      "localhost:3000",
      "web:3000",
      "drivebook.localhost",
    ]) {
      for (const devAliases of [true, false]) {
        const cfg = config({ devAliases });
        expect(await route(host, file, cfg)).toEqual({ kind: "next" });
        expect(await route(host, `${FILES_PATH_PREFIX}logos/abc123?v=1`, cfg)).toEqual({ kind: "next" });
      }
    }
  });

  it("does not resolve the dealer slug for a file request", async () => {
    const cfg = config();
    await route("demo.drivebook.localhost", file, cfg);
    expect(cfg.resolveSlug).not.toHaveBeenCalled();
  });

  it("keeps routing other /api paths on dealer hosts to the site", async () => {
    expect(await route("demo.drivebook.localhost", path("api", "filesx", "a.png"))).toMatchObject({
      kind: "rewrite",
      pathname: "/site/demo/api/filesx/a.png",
    });
  });
});

describe("routeRequest: gate-only test login", () => {
  it("passes the test login through untouched on app. and non-dealer hosts", async () => {
    expect(await route("app.drivebook.localhost", TEST_LOGIN_PATH)).toEqual({ kind: "next" });
    expect(await route("app.drivebook.localhost:3000", TEST_LOGIN_PATH)).toEqual({ kind: "next" });
    for (const host of ["localhost:3000", "web:3000", "drivebook.localhost"]) {
      expect(await route(host, TEST_LOGIN_PATH)).toEqual({ kind: "next" });
      expect(await route(host, TEST_LOGIN_PATH, config({ devAliases: false }))).toEqual({ kind: "next" });
    }
  });

  it("only passes the exact path through on app.", async () => {
    expect(await route("app.drivebook.localhost", `${TEST_LOGIN_PATH}/x`)).toMatchObject({
      kind: "rewrite",
      pathname: `/dealer-admin${TEST_LOGIN_PATH}/x`,
    });
  });

  it("does not pass it through on dealer or admin. hosts", async () => {
    expect(await route("demo.drivebook.localhost", TEST_LOGIN_PATH)).toMatchObject({
      kind: "rewrite",
      pathname: `/site/demo${TEST_LOGIN_PATH}`,
    });
    expect(await route("admin.drivebook.localhost", TEST_LOGIN_PATH)).toMatchObject({
      kind: "rewrite",
      pathname: `/backoffice${TEST_LOGIN_PATH}`,
    });
  });

  it("redirects to the dealer admin home for the host, and refuses dealer and admin. hosts", () => {
    const base = "drivebook.localhost";
    expect(testLoginRedirect("app.drivebook.localhost:3000", base)).toBe("/");
    expect(testLoginRedirect("localhost:3000", base)).toBe("/_dev/app");
    expect(testLoginRedirect("drivebook.localhost", base)).toBe("/_dev/app");
    expect(testLoginRedirect("demo.drivebook.localhost", base)).toBeNull();
    expect(testLoginRedirect("admin.drivebook.localhost", base)).toBeNull();
  });
});

describe("sessionCookieSecure", () => {
  const h = (init: Record<string, string>) => new Headers(init);

  it("stays Secure on https, localhost and *.localhost", () => {
    expect(sessionCookieSecure(h({ host: "localhost:3000" }), true)).toBe(true);
    expect(sessionCookieSecure(h({ host: "app.drivebook.localhost:3000" }), true)).toBe(true);
    expect(sessionCookieSecure(h({ host: "web:3000", "x-forwarded-proto": "https" }), true)).toBe(true);
  });

  it("drops Secure only on plain-http non-localhost hosts with dev aliases on", () => {
    expect(sessionCookieSecure(h({ host: "web:3000", "x-forwarded-proto": "http" }), true)).toBe(false);
    expect(sessionCookieSecure(h({ host: "web:3000" }), true)).toBe(false);
    expect(sessionCookieSecure(h({ host: "web:3000", "x-forwarded-proto": "http" }), false)).toBe(true);
  });
});

describe("routeRequest: dev aliases", () => {
  it("routes /_dev/site/{slug} like a dealer host, with the alias base path", async () => {
    expect(await route("localhost:3000", "/_dev/site/demo?car=1")).toEqual({
      kind: "rewrite",
      pathname: "/site/demo",
      search: "?car=1",
      headers: { "x-drivebook-base-path": "/_dev/site/demo" },
    });
    expect(await route("localhost", "/_dev/site/demo/zasebnost")).toMatchObject({
      pathname: "/site/demo/zasebnost",
    });
  });

  it("404s reserved or missing slugs under /_dev/site", async () => {
    const cfg = config();
    expect(await route("localhost", path("_dev", "site", "www"), cfg)).toEqual(notFound());
    expect(cfg.resolveSlug).not.toHaveBeenCalled();
  });

  it("serves the dev index at /_dev and sends a bare /_dev/site there", async () => {
    const cfg = config();
    expect(await route("localhost", "/_dev", cfg)).toEqual({ kind: "rewrite", pathname: "/dev", search: "" });
    expect(await route("web:3000", "/_dev/", cfg)).toEqual({ kind: "rewrite", pathname: "/dev", search: "" });
    expect(await route("localhost", "/_dev/site/", cfg)).toEqual({ kind: "redirect", status: 307, location: "/_dev" });
    expect(await route("localhost", "/_dev/site", cfg)).toEqual({ kind: "redirect", status: 307, location: "/_dev" });
    expect(await route("localhost", "/dev", cfg)).toEqual({ kind: "redirect", status: 307, location: "/_dev" });
    expect(await route("demo.drivebook.localhost", "/dev", cfg)).toEqual(notFound());
    expect(cfg.resolveSlug).not.toHaveBeenCalled();
  });

  it("redirects /app and /admin on a non-dealer host to their dev aliases", async () => {
    expect(await route("web:3000", "/admin")).toEqual({ kind: "redirect", status: 307, location: "/_dev/admin" });
    expect(await route("localhost", "/app/login?x=1")).toEqual({
      kind: "redirect",
      status: 307,
      location: "/_dev/app/login?x=1",
    });
    expect(await route("localhost", path("apples"))).toEqual({ kind: "next" });
    expect(await route("localhost", "/admin", config({ devAliases: false }))).toEqual({ kind: "next" });
  });

  it("redirects a renamed slug within the alias", async () => {
    const cfg = config({ resolveSlug: async () => ({ kind: "renamed", slug: "demo" }) });
    expect(await route("localhost", `${path("_dev", "site", "avtohisa-demo", "x")}?car=abc`, cfg)).toEqual({
      kind: "redirect",
      status: 301,
      location: `${path("_dev", "site", "demo", "x")}?car=abc`,
    });
  });

  it("routes /_dev/app and /_dev/admin like app. and admin.", async () => {
    expect(await route("localhost", "/_dev/app/login")).toEqual({
      kind: "rewrite",
      pathname: "/dealer-admin/login",
      search: "",
      headers: { "x-drivebook-base-path": "/_dev/app" },
    });
    expect(await route("localhost", "/_dev/admin/login")).toMatchObject({
      pathname: "/backoffice/login",
      headers: { "x-drivebook-base-path": "/_dev/admin" },
    });
    expect(await route("localhost", "/_dev/app")).toEqual({
      kind: "rewrite",
      pathname: "/dealer-admin",
      search: "",
      headers: { "x-drivebook-base-path": "/_dev/app" },
    });
    expect(await route("localhost", "/_dev/admin")).toMatchObject({
      pathname: "/backoffice",
      headers: { "x-drivebook-base-path": "/_dev/admin" },
    });
    expect(await route("localhost", "/_dev/admin/")).toEqual({
      kind: "rewrite",
      pathname: "/backoffice/",
      search: "",
      headers: { "x-drivebook-base-path": "/_dev/admin" },
    });
    expect(await route("localhost", path("_dev", "other"))).toEqual({ kind: "redirect", status: 307, location: "/_dev" });
  });

  it("serves dev aliases on non-dealer hosts such as preview proxies", async () => {
    expect(await route("web:3000", "/_dev/app/login")).toMatchObject({ pathname: "/dealer-admin/login" });
    expect(await route("preview.example.com", "/_dev/admin/login")).toMatchObject({ pathname: "/backoffice/login" });
  });

  it("serves the dev inbox at /_dev/inbox", async () => {
    const inbox = { kind: "rewrite", pathname: "/dev/inbox", search: "" };
    expect(await route("localhost", "/_dev/inbox")).toEqual(inbox);
    expect(await route("web:3000", "/_dev/inbox/")).toEqual(inbox);
    expect(await route("localhost", "/dev/inbox")).toEqual({ kind: "redirect", status: 307, location: "/_dev/inbox" });
    expect(await route("demo.drivebook.localhost", "/_dev/inbox")).toEqual(notFound());
  });

  it("404s the dev inbox in production unless DEV_INBOX_ENABLED is set", async () => {
    const off = config({ devAliases: false, devInbox: false });
    expect(await route("localhost", "/_dev/inbox", off)).toEqual(notFound());
    expect(await route("localhost", "/dev/inbox", off)).toEqual(notFound());

    const on = config({ devAliases: false, devInbox: true });
    expect(await route("preview.example.com", "/_dev/inbox", on)).toEqual({ kind: "rewrite", pathname: "/dev/inbox", search: "" });
    expect(await route("localhost", "/_dev", on)).toEqual(notFound());
    expect(await route("localhost", path("_dev", "inbox", "x"), on)).toEqual(notFound());
    expect(await route("localhost", "/dev/inbox", on)).toEqual(notFound());
    expect(await route("app.drivebook.localhost", "/_dev/inbox", on)).toEqual(notFound());
  });

  it("404s /_dev/* when dev aliases are off", async () => {
    const off = config({ devAliases: false });
    expect(await route("localhost", "/_dev/site/demo?car=1", off)).toEqual(notFound("?car=1"));
    expect(await route("localhost", "/_dev/app/login", off)).toEqual(notFound());
    expect(await route("localhost", "/_dev", off)).toEqual(notFound());
    expect(await route("preview.example.com", "/_dev/app/login", off)).toEqual(notFound());
    expect(off.resolveSlug).not.toHaveBeenCalled();
  });
});

describe("routeRequest: renamed slug (real database)", () => {
  const db = getTestDb();

  beforeAll(async () => {
    setDbForTests(db);
    await truncateAll();
    const [plan] = await db
      .insert(plans)
      .values({ code: "basic", name: "Basic", maxCars: 20, maxUsers: 5, monthlySmsQuota: 100, priceEurCents: 4900 })
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
    await db.insert(dealerSlugHistory).values({ dealerId: dealer.id, slug: "avtohisa-demo" });
  });

  afterAll(async () => {
    await truncateAll();
    setDbForTests(undefined);
    await db.$client.end();
  });

  it("301s an old slug to the new host, keeping port, path and query", async () => {
    const cfg = config({ resolveSlug: resolveDealerSlug, protocol: "http:" });
    expect(await route("avtohisa-demo.drivebook.localhost:3000", `${path("x")}?car=abc`, cfg)).toEqual({
      kind: "redirect",
      status: 301,
      location: "http://demo.drivebook.localhost:3000/x?car=abc",
    });
  });

  it("rewrites the current slug and unknown slugs to the site page", async () => {
    const cfg = config({ resolveSlug: resolveDealerSlug });
    expect(await route("demo.drivebook.localhost:3000", "/", cfg)).toMatchObject({ pathname: "/site/demo/" });
    expect(await route("nobody.drivebook.localhost:3000", "/", cfg)).toMatchObject({ pathname: path("site", "nobody", "") });
  });
});
