import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resetConfigForTests } from "@/lib/config";

const dir = await mkdtemp(path.join(tmpdir(), "drivebook-files-route-"));
const previousStorageDir = process.env.STORAGE_DIR;
process.env.STORAGE_DIR = dir;
resetConfigForTests();

const { GET, HEAD } = await import("@/app/api/files/[...key]/route");
const { getStorage } = await import("@/server/storage");

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

const ctx = (key: string[]) => ({ params: Promise.resolve({ key }) });
const request = (method: string, headers: Record<string, string> = {}) =>
  new Request("http://demo.drivebook.localhost/api/files/x", { method, headers });
const get = (key: string, headers?: Record<string, string>) => GET(request("GET", headers), ctx(key.split("/")));

beforeAll(async () => {
  await getStorage().put("logos/abc123.png", PNG, "image/png");
  await getStorage().put("logos/mark.svg", SVG, "image/svg+xml");
});

afterAll(async () => {
  if (previousStorageDir === undefined) delete process.env.STORAGE_DIR;
  else process.env.STORAGE_DIR = previousStorageDir;
  resetConfigForTests();
  await rm(dir, { recursive: true, force: true });
});

describe("GET /api/files/[...key]", () => {
  it("serves the stored bytes with type, length and immutable cache headers", async () => {
    const res = await get("logos/abc123.png");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("content-length")).toBe(String(PNG.byteLength));
    expect(res.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("etag")).toMatch(/^"[^"]+"$/);
    expect(res.headers.get("content-security-policy")).toBeNull();
    expect(Buffer.from(await res.arrayBuffer())).toEqual(PNG);
  });

  it("sandboxes SVG responses with a CSP", async () => {
    const res = await get("logos/mark.svg");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/svg+xml");
    expect(res.headers.get("content-security-policy")).toBe("default-src 'none'; style-src 'unsafe-inline'; sandbox");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("answers 304 when If-None-Match matches the ETag", async () => {
    const etag = (await get("logos/abc123.png")).headers.get("etag")!;
    for (const header of [etag, `W/${etag}`, `"other", ${etag}`, "*"]) {
      const res = await get("logos/abc123.png", { "if-none-match": header });
      expect(res.status).toBe(304);
      expect(res.headers.get("etag")).toBe(etag);
      expect(await res.text()).toBe("");
    }
    expect((await get("logos/abc123.png", { "if-none-match": '"other"' })).status).toBe(200);
  });

  it("answers 404 for a missing key", async () => {
    expect((await get("logos/missing.png")).status).toBe(404);
  });

  it("answers 404 for traversal and sidecar keys", async () => {
    await writeFile(path.join(dir, "secret.txt.meta.json"), JSON.stringify({ contentType: "text/plain" }));
    for (const key of [
      ["..%2F..%2Fetc", "passwd"],
      ["../../etc", "passwd"],
      ["..", "outside.txt"],
      ["logos", "..", "..", "etc", "passwd"],
      ["logos", "abc123.png.meta.json"],
      ["secret.txt.meta.json"],
      [""],
    ]) {
      expect((await GET(request("GET"), ctx(key))).status).toBe(404);
    }
  });
});

describe("HEAD /api/files/[...key]", () => {
  it("sends the same headers without a body", async () => {
    const res = await HEAD(request("HEAD"), ctx(["logos", "abc123.png"]));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("content-length")).toBe(String(PNG.byteLength));
    expect(res.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(res.headers.get("etag")).toBe((await get("logos/abc123.png")).headers.get("etag"));
    expect(res.body).toBeNull();
  });

  it("answers 404 for a missing key", async () => {
    expect((await HEAD(request("HEAD"), ctx(["logos", "missing.png"]))).status).toBe(404);
  });
});
