// The renamed-slug case uses the real test database: start Postgres with `docker compose up -d db`.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { dealers, dealerSlugHistory, plans } from "@/db/schema";
import { setDbForTests } from "@/server/data/db";
import { resolveDealerSlug, type ResolvedDealerSlug } from "@/server/data/dealers";
import { requestHost, routeRequest, type RouteConfig } from "@/server/routing";
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

const notFound = (search = "") => ({ kind: "rewrite", pathname: "/_404", search });

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
    expect(await route("demo.drivebook.localhost:3000", "/zasebnost")).toMatchObject({
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

  it("redirects app. and admin. roots to /login and rewrites their paths", async () => {
    expect(await route("app.drivebook.localhost", "/")).toEqual({ kind: "redirect", status: 307, location: "/login" });
    expect(await route("admin.drivebook.localhost", "/")).toEqual({ kind: "redirect", status: 307, location: "/login" });
    expect(await route("app.drivebook.localhost", "/login")).toEqual({
      kind: "rewrite",
      pathname: "/dealer-admin/login",
      search: "",
    });
    expect(await route("admin.drivebook.localhost", "/login?next=x")).toEqual({
      kind: "rewrite",
      pathname: "/backoffice/login",
      search: "?next=x",
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

  it("404s the internal prefixes on the root host", async () => {
    expect(await route("localhost", "/site/demo")).toEqual(notFound());
    expect(await route("localhost", "/backoffice/login")).toEqual(notFound());
    expect(await route("localhost:3000", "/dealer-admin/login")).toEqual(notFound());
    expect(await route("localhost", "/sitemap.xml")).toEqual({ kind: "next" });
  });

  it("keeps each surface's routes unreachable from the other hosts", async () => {
    const cfg = config();
    expect(await route("demo.drivebook.localhost", "/dealer-admin/login", cfg)).toEqual(notFound());
    expect(await route("demo.drivebook.localhost", "/backoffice/login", cfg)).toEqual(notFound());
    expect(await route("app.drivebook.localhost", "/backoffice/login")).toEqual(notFound());
    expect(await route("app.drivebook.localhost", "/site/demo")).toEqual(notFound());
    expect(await route("admin.drivebook.localhost", "/dealer-admin/login")).toEqual(notFound());
    expect(await route("localhost", "/_dev/app/backoffice/login")).toEqual(notFound());
    expect(cfg.resolveSlug).not.toHaveBeenCalled();
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
    expect(await route("localhost", "/_dev/site/www", cfg)).toEqual(notFound());
    expect(await route("localhost", "/_dev/site/", cfg)).toEqual(notFound());
    expect(cfg.resolveSlug).not.toHaveBeenCalled();
  });

  it("redirects a renamed slug within the alias", async () => {
    const cfg = config({ resolveSlug: async () => ({ kind: "renamed", slug: "demo" }) });
    expect(await route("localhost", "/_dev/site/avtohisa-demo/x?car=abc", cfg)).toEqual({
      kind: "redirect",
      status: 301,
      location: "/_dev/site/demo/x?car=abc",
    });
  });

  it("routes /_dev/app and /_dev/admin like app. and admin.", async () => {
    expect(await route("localhost", "/_dev/app/login")).toEqual({
      kind: "rewrite",
      pathname: "/dealer-admin/login",
      search: "",
    });
    expect(await route("localhost", "/_dev/admin/login")).toMatchObject({ pathname: "/backoffice/login" });
    expect(await route("localhost", "/_dev/app")).toEqual({ kind: "redirect", status: 307, location: "/_dev/app/login" });
    expect(await route("localhost", "/_dev/admin/")).toEqual({
      kind: "redirect",
      status: 307,
      location: "/_dev/admin/login",
    });
    expect(await route("localhost", "/_dev/other")).toEqual(notFound());
  });

  it("serves dev aliases on non-dealer hosts such as preview proxies", async () => {
    expect(await route("web:3000", "/_dev/app/login")).toMatchObject({ pathname: "/dealer-admin/login" });
    expect(await route("preview.example.com", "/_dev/admin/login")).toMatchObject({ pathname: "/backoffice/login" });
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
      .values({ code: "basic", name: "Basic", maxCars: 20, maxUsers: 5, smsIncluded: 100, priceEurCents: 4900 })
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
    expect(await route("avtohisa-demo.drivebook.localhost:3000", "/x?car=abc", cfg)).toEqual({
      kind: "redirect",
      status: 301,
      location: "http://demo.drivebook.localhost:3000/x?car=abc",
    });
  });

  it("rewrites the current slug and unknown slugs to the site page", async () => {
    const cfg = config({ resolveSlug: resolveDealerSlug });
    expect(await route("demo.drivebook.localhost:3000", "/", cfg)).toMatchObject({ pathname: "/site/demo/" });
    expect(await route("nobody.drivebook.localhost:3000", "/", cfg)).toMatchObject({ pathname: "/site/nobody/" });
  });
});
