import { NextResponse, type NextRequest } from "next/server";
import { getConfig } from "@/lib/config";
import { resolveDealerSlug } from "@/server/data/dealers";
import { BASE_PATH_HEADER, requestHost, routeRequest } from "@/server/routing";

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
      return NextResponse.rewrite(url, { request: { headers } });
    }
  }
}

export const config = {
  matcher: [
    "/((?!_next/|favicon\\.ico$|.*\\.(?:svg|png|jpe?g|gif|webp|avif|ico|css|js|map|woff2?|ttf|otf|txt|xml|webmanifest)$).*)",
  ],
};
