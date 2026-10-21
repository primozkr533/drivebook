export type SurfaceOrigins = { dealer: string; backoffice: string };

const ALIAS = { dealer: "/_dev/app", backoffice: "/_dev/admin" } as const;

const originOf = (url: string) => {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
};

// Mail links point at app./admin. hosts, which may not open from a localhost or preview-proxy inbox.
export function rewriteSurfaceLink(url: string, origins: SurfaceOrigins): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  for (const surface of ["dealer", "backoffice"] as const) {
    if (parsed.origin === originOf(origins[surface])) {
      return `${ALIAS[surface]}${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
  }
  return url;
}

const HREF = /(\bhref\s*=\s*)(["'])(.*?)\2/gi;

export function rewriteHtmlLinks(html: string, origins: SurfaceOrigins): string {
  return html.replace(HREF, (_, attr: string, quote: string, url: string) => `${attr}${quote}${rewriteSurfaceLink(url, origins)}${quote}`);
}
