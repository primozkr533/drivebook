import { createHash } from "node:crypto";
import { getStorage, isValidStorageKey } from "@/server/storage";

type Context = { params: Promise<{ key: string[] }> };

const notFound = () => new Response(null, { status: 404 });

function etagMatches(header: string | null, etag: string): boolean {
  if (!header) return false;
  return header.split(",").some((tag) => {
    const value = tag.trim();
    return value === "*" || value === etag || value === `W/${etag}`;
  });
}

async function serve(request: Request, { params }: Context, withBody: boolean): Promise<Response> {
  const key = (await params).key.join("/");
  if (!isValidStorageKey(key)) return notFound();
  const file = await getStorage().get(key);
  if (!file) return notFound();

  const etag = `"${createHash("sha256").update(file.data).digest("base64url").slice(0, 32)}"`;
  const headers = new Headers({
    "Cache-Control": "public, max-age=31536000, immutable",
    ETag: etag,
    "X-Content-Type-Options": "nosniff",
  });
  // SVG can carry script; sandbox it in case it is opened directly.
  if (file.contentType === "image/svg+xml") {
    headers.set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox");
  }
  if (etagMatches(request.headers.get("if-none-match"), etag)) return new Response(null, { status: 304, headers });

  headers.set("Content-Type", file.contentType);
  headers.set("Content-Length", String(file.size));
  return new Response(withBody ? new Uint8Array(file.data) : null, { status: 200, headers });
}

export function GET(request: Request, context: Context) {
  return serve(request, context, true);
}

export function HEAD(request: Request, context: Context) {
  return serve(request, context, false);
}
