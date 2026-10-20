import { isReservedSlug } from "@/lib/config";
import type { ResolvedDealerSlug } from "@/server/data/dealers";

export const BASE_PATH_HEADER = "x-drivebook-base-path";
// Built rather than a literal so route crawlers don't take the rewrite target for a page.
export const NOT_FOUND_PATH = ["", "_404"].join("/");
export const DEV_INDEX_PATH = "/dev";

// Root-host paths that, with dev aliases on, redirect to the alias that actually serves them.
const DEV_REDIRECTS: [string, string][] = [
  ["/app", "/_dev/app"],
  ["/admin", "/_dev/admin"],
  ["/dealer-admin", "/_dev/app"],
  ["/backoffice", "/_dev/admin"],
  ["/site", "/_dev/site"],
  [DEV_INDEX_PATH, "/_dev"],
];

export type RouteConfig = {
  baseDomain: string;
  devAliases: boolean;
  resolveSlug: (slug: string) => Promise<ResolvedDealerSlug>;
  protocol?: string;
};

export type RouteResult =
  | { kind: "next" }
  | { kind: "rewrite"; pathname: string; search: string; headers?: Record<string, string> }
  | { kind: "redirect"; status: 301 | 307; location: string };

const SLUG_LABEL = /^[a-z0-9-]{1,63}$/;
const INTERNAL_PREFIXES = ["/site", "/dealer-admin", "/backoffice", "/_dev", DEV_INDEX_PATH];

const notFound = (search: string): RouteResult => ({ kind: "rewrite", pathname: NOT_FOUND_PATH, search });

export function requestHost(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  return forwarded || headers.get("host") || "";
}

function splitHost(host: string): { hostname: string; port: string } {
  const match = /^(.*?)(:\d+)?$/.exec(host.trim().toLowerCase());
  return { hostname: (match?.[1] ?? "").replace(/\.$/, ""), port: match?.[2] ?? "" };
}

function underPrefix(pathname: string, prefix: string): string | null {
  if (pathname === prefix) return "";
  return pathname.startsWith(`${prefix}/`) ? pathname.slice(prefix.length) : null;
}

const isInternal = (pathname: string) => INTERNAL_PREFIXES.some((prefix) => underPrefix(pathname, prefix) !== null);

function surface(internal: "/dealer-admin" | "/backoffice", path: string, search: string, aliasPrefix = ""): RouteResult {
  if (path === "" || path === "/") return { kind: "redirect", status: 307, location: `${aliasPrefix}/login` };
  // Under a dev alias, a nested internal path goes back through root-host routing (its own alias).
  if (isInternal(path) && aliasPrefix) return { kind: "redirect", status: 307, location: `${path}${search}` };
  if (isInternal(path)) return notFound(search);
  return { kind: "rewrite", pathname: `${internal}${path}`, search };
}

async function dealerSite(
  slug: string,
  path: string,
  search: string,
  cfg: RouteConfig,
  renamedLocation: (newSlug: string) => string,
  basePath: string,
): Promise<RouteResult> {
  if (!SLUG_LABEL.test(slug) || isReservedSlug(slug) || isInternal(path)) return notFound(search);
  const resolved = await cfg.resolveSlug(slug);
  if (resolved.kind === "renamed") return { kind: "redirect", status: 301, location: renamedLocation(resolved.slug) };
  return { kind: "rewrite", pathname: `/site/${slug}${path}`, search, headers: { [BASE_PATH_HEADER]: basePath } };
}

export async function routeRequest(host: string, pathname: string, search: string, cfg: RouteConfig): Promise<RouteResult> {
  const { hostname, port } = splitHost(host);
  const base = cfg.baseDomain;

  if (hostname.endsWith(`.${base}`)) {
    const label = hostname.slice(0, -(base.length + 1));
    if (label === "app") return surface("/dealer-admin", pathname, search);
    if (label === "admin") return surface("/backoffice", pathname, search);
    const protocol = cfg.protocol ?? "http:";
    return dealerSite(
      label,
      pathname,
      search,
      cfg,
      (newSlug) => `${protocol}//${newSlug}.${base}${port}${pathname}${search}`,
      "",
    );
  }

  const devPath = underPrefix(pathname, "/_dev");
  if (cfg.devAliases && devPath !== null) {
    if (devPath === "" || devPath === "/") return { kind: "rewrite", pathname: DEV_INDEX_PATH, search };
    const app = underPrefix(devPath, "/app");
    if (app !== null) return surface("/dealer-admin", app, search, "/_dev/app");
    const admin = underPrefix(devPath, "/admin");
    if (admin !== null) return surface("/backoffice", admin, search, "/_dev/admin");
    const site = underPrefix(devPath, "/site");
    if (site === "" || site === "/") return { kind: "redirect", status: 307, location: "/_dev" };
    if (site) {
      const [, slug = "", ...rest] = site.split("/");
      const path = rest.length ? `/${rest.join("/")}` : "";
      return dealerSite(
        slug,
        path,
        search,
        cfg,
        (newSlug) => `/_dev/site/${newSlug}${path}${search}`,
        `/_dev/site/${slug}`,
      );
    }
    return { kind: "redirect", status: 307, location: "/_dev" };
  }

  if (cfg.devAliases) {
    for (const [prefix, alias] of DEV_REDIRECTS) {
      const rest = underPrefix(pathname, prefix);
      if (rest !== null) return { kind: "redirect", status: 307, location: `${alias}${rest}${search}` };
    }
  }

  // Non-dealer hosts (localhost, preview proxies) get the root-host treatment; dev aliases are handled above.
  if (isInternal(pathname)) return notFound(search);
  return { kind: "next" };
}
