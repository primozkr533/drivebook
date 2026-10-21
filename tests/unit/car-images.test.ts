import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetConfigForTests } from "@/lib/config";

const lookup = vi.hoisted(() => vi.fn());
vi.mock("node:dns/promises", () => ({ lookup, default: { lookup } }));

const dir = await mkdtemp(path.join(tmpdir(), "drivebook-car-images-"));
const previousStorageDir = process.env.STORAGE_DIR;
process.env.STORAGE_DIR = dir;
resetConfigForTests();

const { CarImageError, downloadImage, processCarImage, storeCarImageFromUrl } = await import("@/server/cars/images");
const { getStorage, isValidStorageKey } = await import("@/server/storage");
const { GET } = await import("@/app/api/files/[...key]/route");

afterAll(async () => {
  if (previousStorageDir === undefined) delete process.env.STORAGE_DIR;
  else process.env.STORAGE_DIR = previousStorageDir;
  resetConfigForTests();
  await rm(dir, { recursive: true, force: true });
});

const image = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: { r: 200, g: 80, b: 20 } } });

async function expectCode(promise: Promise<unknown>, code: string) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(CarImageError);
  expect((error as InstanceType<typeof CarImageError>).code).toBe(code);
}

describe("processCarImage", () => {
  it("stores a 3000×2000 JPEG as a 1200 px WebP under a servable cars/ key", async () => {
    const jpeg = await image(3000, 2000).jpeg().toBuffer();
    const stored = await processCarImage(jpeg);

    expect(stored.contentType).toBe("image/webp");
    expect(stored.key).toMatch(/^cars\/[A-Za-z0-9]{16}\.webp$/);
    expect(isValidStorageKey(stored.key)).toBe(true);

    const file = await getStorage().get(stored.key);
    expect(file?.contentType).toBe("image/webp");
    const meta = await sharp(file!.data).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(1200);
    expect(meta.height).toBe(800);

    const res = await GET(new Request("http://demo.drivebook.localhost/api/files/x"), {
      params: Promise.resolve({ key: stored.key.split("/") }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/webp");
    expect(Buffer.from(await res.arrayBuffer())).toEqual(file!.data);
  });

  it("does not enlarge narrow images", async () => {
    const stored = await processCarImage(await image(800, 600).png().toBuffer());
    const meta = await sharp((await getStorage().get(stored.key))!.data).metadata();
    expect(meta.width).toBe(800);
    expect(meta.height).toBe(600);
  });

  it("auto-rotates by EXIF orientation and strips metadata", async () => {
    const jpeg = await image(400, 200).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    const stored = await processCarImage(jpeg);
    const meta = await sharp((await getStorage().get(stored.key))!.data).metadata();
    expect(meta.width).toBe(200);
    expect(meta.height).toBe(400);
    expect(meta.exif).toBeUndefined();
    expect(meta.orientation).toBeUndefined();
  });

  it("accepts WebP, GIF and AVIF", async () => {
    for (const bytes of [
      await image(300, 200).webp().toBuffer(),
      await image(300, 200).gif().toBuffer(),
      await image(300, 200).avif().toBuffer(),
    ]) {
      const stored = await processCarImage(bytes);
      expect(stored.key).toMatch(/^cars\/.+\.webp$/);
    }
  });

  it("rejects SVG and non-image bytes with unsupported_type", async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>');
    await expectCode(processCarImage(svg), "unsupported_type");
    await expectCode(processCarImage(Buffer.from("hello, not an image")), "unsupported_type");
    await expectCode(processCarImage(new Uint8Array([0xff, 0xd8, 0xff, 0, 0, 0])), "unsupported_type");
  });

  it("rejects input over 10 MB with too_large", async () => {
    const big = new Uint8Array(10 * 1024 * 1024 + 1);
    big.set([0xff, 0xd8, 0xff]);
    await expectCode(processCarImage(big), "too_large");
  });
});

describe("downloadImage", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    lookup.mockReset();
    lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("returns the bytes and sends a browser User-Agent", async () => {
    const png = await image(50, 50).png().toBuffer();
    fetchMock.mockResolvedValue(new Response(png, { headers: { "content-type": "image/png" } }));

    const bytes = await downloadImage("https://images.example.com/car.png");

    expect(Buffer.from(bytes)).toEqual(png);
    const [, init] = fetchMock.mock.calls[0];
    expect(new Headers(init?.headers).get("user-agent")).toMatch(/^Mozilla\/5\.0 .*Chrome\//);
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("times out after 10 s with download_failed", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
    );
    const result = downloadImage("https://images.example.com/slow.jpg").catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(10_000);
    const error = await result;
    expect(error).toBeInstanceOf(CarImageError);
    expect((error as InstanceType<typeof CarImageError>).code).toBe("download_failed");
  });

  it("rejects a declared oversize body with too_large", async () => {
    fetchMock.mockResolvedValue(
      new Response("x", { headers: { "content-type": "image/jpeg", "content-length": String(11 * 1024 * 1024) } }),
    );
    await expectCode(downloadImage("https://images.example.com/big.jpg"), "too_large");
  });

  it("aborts a streamed body once it passes 10 MB with too_large", async () => {
    let pulls = 0;
    let cancelled = false;
    const chunk = new Uint8Array(1024 * 1024);
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls++;
        controller.enqueue(chunk);
      },
      cancel() {
        cancelled = true;
      },
    });
    fetchMock.mockResolvedValue(new Response(body, { headers: { "content-type": "image/jpeg" } }));

    await expectCode(downloadImage("https://images.example.com/endless.jpg"), "too_large");
    expect(cancelled).toBe(true);
    expect(pulls).toBeLessThanOrEqual(13);
  });

  it("rejects a text/html response with unsupported_type", async () => {
    fetchMock.mockResolvedValue(new Response("<html></html>", { headers: { "content-type": "text/html; charset=utf-8" } }));
    await expectCode(downloadImage("https://www.avto.net/listing"), "unsupported_type");
  });

  it("maps HTTP errors to download_failed", async () => {
    fetchMock.mockResolvedValue(new Response("nope", { status: 404, headers: { "content-type": "image/jpeg" } }));
    await expectCode(downloadImage("https://images.example.com/missing.jpg"), "download_failed");
  });

  it.each([
    "http://127.0.0.1/a.jpg",
    "http://10.1.2.3/a.jpg",
    "http://169.254.169.254/latest/meta-data/",
    "http://localhost:3000/a.jpg",
    "http://[::1]/a.jpg",
    "http://[::ffff:127.0.0.1]/a.jpg",
    "http://192.168.0.10/a.jpg",
    "http://172.20.0.1/a.jpg",
    "http://user:pass@images.example.com/a.jpg",
    "ftp://images.example.com/a.jpg",
    "file:///etc/passwd",
  ])("blocks %s without fetching", async (url) => {
    await expectCode(downloadImage(url), "blocked_host");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("blocks hostnames that resolve to a private address", async () => {
    lookup.mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
      { address: "10.0.0.5", family: 4 },
    ]);
    await expectCode(downloadImage("https://internal.example.com/a.jpg"), "blocked_host");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("re-checks the host on redirects", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 302, headers: { location: "http://169.254.169.254/" } }));
    await expectCode(downloadImage("https://images.example.com/a.jpg"), "blocked_host");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("storeCarImageFromUrl downloads and stores a WebP", async () => {
    const jpeg = await image(1600, 900).jpeg().toBuffer();
    fetchMock.mockResolvedValue(new Response(jpeg, { headers: { "content-type": "image/jpeg" } }));
    const stored = await storeCarImageFromUrl("https://images.example.com/car.jpg");
    const meta = await sharp((await getStorage().get(stored.key))!.data).metadata();
    expect(stored.contentType).toBe("image/webp");
    expect(meta.width).toBe(1200);
  });
});
