import { NextResponse, type NextRequest } from "next/server";
import { getConfig } from "@/lib/config";
import { resolveDealerSlug } from "@/server/data/dealers";
import { refreshSessionCookie, SESSION_COOKIE, sessionCookieOptions, type AuthSurface } from "@/server/auth/session";
import { BASE_PATH_HEADER, requestHost, routeRequest, sessionCookieSecure } from "@/server/routing";

const SURFACE_PREFIXES: [string, AuthSurface][] = [
  ["/dealer-admin", "dealer"],
  ["/backoffice", "backoffice"],
];

function rewriteSurface(pathname: string): AuthSurface | null {
  const match = SURFACE_PREFIXES.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  return match?.[1] ?? null;
}

// Next 16 proxy always runs on Node.js (a `runtime` key here is a build error), so it can reach the DB.
export async function proxy(request: NextRequest) {
  const { baseDomain, devAliases, devInboxEnabled } = getConfig();
  const host = requestHost(request.headers);
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol = forwardedProto ? `${forwardedProto}:` : request.nextUrl.protocol;
  const { pathname, search } = request.nextUrl;

  const result = await routeRequest(host, pathname, search, {
    baseDomain,
    devAliases,
    devInbox: devInboxEnabled,
    resolveSlug: resolveDealerSlug,
    protocol,
  });

  // Pages trust this header, so a client-supplied value must never reach them.
  const headers = new Headers(request.headers);
  headers.delete(BASE_PATH_HEADER);

  switch (result.kind) {
    case "next":
      return NextResponse.next({ request: { headers } });
    case "redirect":
      return NextResponse.redirect(new URL(result.location, `${protocol}//${host}`), result.status);
    case "rewrite": {
      for (const [name, value] of Object.entries(result.headers ?? {})) headers.set(name, value);
      const url = request.nextUrl.clone();
      url.pathname = result.pathname;
      url.search = result.search;
      const response = NextResponse.rewrite(url, { request: { headers } });
      // Only app./admin. (and their dev aliases) rewrite to a surface, so dealer hosts never get the cookie.
      const surface = rewriteSurface(result.pathname);
      const token = surface && request.cookies.get(SESSION_COOKIE[surface])?.value;
      if (surface && token && (await refreshSessionCookie(surface, token))) {
        const secure = sessionCookieSecure(request.headers, devAliases);
        response.cookies.set(SESSION_COOKIE[surface], token, sessionCookieOptions(secure));
      }
      return response;
    }
  }
}

export const config = {
  matcher: [
    "/((?!_next/|favicon\\.ico$|.*\\.(?:svg|png|jpe?g|gif|webp|avif|ico|css|js|map|woff2?|ttf|otf|txt|xml|webmanifest)$).*)",
  ],
};
