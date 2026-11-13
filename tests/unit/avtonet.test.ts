import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchAvtonetListing, isAvtonetUrl, parseAvtonetHtml } from "@/server/cars/avtonet";

const fixture = (name: string) =>
  readFileSync(new URL(`../fixtures/avtonet/${name}.html`, import.meta.url), "utf8");

const LISTING_URL = "https://www.avto.net/Ads/details.asp?id=20123456";
const NOW = new Date("2026-10-21T10:00:00Z");

describe("isAvtonetUrl", () => {
  it.each([
    "https://www.avto.net/Ads/details.asp?id=1",
    "https://avto.net/Ads/details.asp?id=1",
    "http://m.avto.net/x",
    "https://WWW.AVTO.NET/Ads/details.asp?id=1",
  ])("accepts %s", (url) => {
    expect(isAvtonetUrl(url)).toBe(true);
  });

  it.each([
    "https://avto.net.evil.com/Ads/details.asp?id=1",
    "https://notavto.net/Ads/details.asp?id=1",
    "https://www.avto.net@evil.com/x",
    "ftp://www.avto.net/Ads/details.asp?id=1",
    "javascript:alert('avto.net')",
    "www.avto.net/Ads/details.asp?id=1",
    "",
  ])("rejects %s", (url) => {
    expect(isAvtonetUrl(url)).toBe(false);
  });
});

describe("parseAvtonetHtml", () => {
  it("reads a listing with full Open Graph tags", () => {
    expect(parseAvtonetHtml(fixture("full-og"), LISTING_URL, NOW)).toEqual({
      make: "Škoda",
      model: "Octavia Combi",
      year: 2019,
      priceEur: 16490,
      imageUrl: "https://images.avto.net/photoV2/20123456/1-Skoda-Octavia-Combi.jpg",
    });
  });

  it("falls back to twitter meta and JSON-LD, resolving a relative image URL", () => {
    expect(parseAvtonetHtml(fixture("meta-jsonld"), LISTING_URL, NOW)).toEqual({
      make: "Mercedes-Benz",
      model: "C-Razred",
      year: 2021,
      priceEur: 31990,
      imageUrl: "https://www.avto.net/photoV2/20654321/main-mercedes.jpg",
    });
  });

  it("reads the visible title and price when there are no meta tags", () => {
    expect(parseAvtonetHtml(fixture("title-price"), LISTING_URL, NOW)).toEqual({
      make: "Alfa Romeo",
      model: "Giulia",
      year: 2018,
      priceEur: 21900,
    });
  });

  it("splits known two-word makes", () => {
    const html = (t: string) => `<html><head><meta property="og:title" content="${t}"></head></html>`;
    expect(parseAvtonetHtml(html("Land Rover Discovery Sport 2.0 TD4"), LISTING_URL, NOW)).toMatchObject({
      make: "Land Rover",
      model: "Discovery Sport",
    });
    expect(parseAvtonetHtml(html("Mercedes Benz GLC 300 e"), LISTING_URL, NOW)).toMatchObject({
      make: "Mercedes-Benz",
      model: "GLC",
    });
    expect(parseAvtonetHtml(html("Volkswagen Golf"), LISTING_URL, NOW)).toEqual({
      make: "Volkswagen",
      model: "Golf",
    });
  });

  it("ignores years outside 1950..current year + 1", () => {
    const html = (d: string) => `<html><head><meta name="description" content="${d}"></head></html>`;
    expect(parseAvtonetHtml(html("1.registracija: 2028"), LISTING_URL, NOW).year).toBeUndefined();
    expect(parseAvtonetHtml(html("1.registracija: 1949"), LISTING_URL, NOW).year).toBeUndefined();
    expect(parseAvtonetHtml(html("1.registracija: 2027"), LISTING_URL, NOW).year).toBe(2027);
  });

  it("parses Slovenian price formats", () => {
    const html = (p: string) => `<html><body><span class="price">${p}</span></body></html>`;
    expect(parseAvtonetHtml(html("12.990 €"), LISTING_URL, NOW).priceEur).toBe(12990);
    expect(parseAvtonetHtml(html("1.250.000,50 EUR"), LISTING_URL, NOW).priceEur).toBe(1250000);
    expect(parseAvtonetHtml(html("€ 7.500"), LISTING_URL, NOW).priceEur).toBe(7500);
  });

  it("omits everything for garbage or non-http image URLs", () => {
    expect(parseAvtonetHtml("not html at all", LISTING_URL, NOW)).toEqual({});
    expect(
      parseAvtonetHtml(
        `<html><head><meta property="og:image" content="javascript:alert(1)"></head></html>`,
        LISTING_URL,
        NOW,
      ),
    ).toEqual({});
  });
});

describe("fetchAvtonetListing", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const htmlResponse = (body: string, status = 200) =>
    new Response(body, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });

  it("returns the parsed fields and sends browser-like headers", async () => {
    fetchMock.mockResolvedValue(htmlResponse(fixture("full-og")));

    const result = await fetchAvtonetListing(LISTING_URL);

    expect(result).toMatchObject({ ok: true, fields: { make: "Škoda", model: "Octavia Combi", priceEur: 16490 } });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(LISTING_URL);
    const headers = init?.headers as Record<string, string>;
    expect(headers["User-Agent"]).toMatch(/Chrome\/\d+/);
    expect(headers["User-Agent"]).toMatch(/Windows NT|Macintosh/);
    expect(headers["Accept-Language"]).toBe("sl,en");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it.each([403, 429])("treats HTTP %i as blocked", async (status) => {
    fetchMock.mockResolvedValue(htmlResponse("Forbidden", status));
    expect(await fetchAvtonetListing(LISTING_URL)).toEqual({ ok: false, reason: "blocked" });
  });

  it("treats a bot-wall page as blocked", async () => {
    fetchMock.mockResolvedValue(htmlResponse(fixture("bot-block")));
    expect(await fetchAvtonetListing(LISTING_URL)).toEqual({ ok: false, reason: "blocked" });
  });

  it("returns timeout when the request is aborted after 10 s", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("The operation was aborted.", "AbortError")),
          );
        }),
    );

    const pending = fetchAvtonetListing(LISTING_URL);
    await vi.advanceTimersByTimeAsync(9_999);
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    expect(await pending).toEqual({ ok: false, reason: "timeout" });
  });

  it("returns http_error for a 500 or a network failure", async () => {
    fetchMock.mockResolvedValueOnce(htmlResponse("Server error", 500));
    expect(await fetchAvtonetListing(LISTING_URL)).toEqual({ ok: false, reason: "http_error" });

    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    expect(await fetchAvtonetListing(LISTING_URL)).toEqual({ ok: false, reason: "http_error" });
  });

  it("returns parse_failed when nothing could be read", async () => {
    fetchMock.mockResolvedValue(htmlResponse("<html><body><p>Oglas ne obstaja.</p></body></html>"));
    expect(await fetchAvtonetListing(LISTING_URL)).toEqual({ ok: false, reason: "parse_failed" });
  });

  it.each(["https://avto.net.evil.com/Ads/details.asp?id=1", "https://www.bolha.com/avto", "javascript:alert(1)"])(
    "returns invalid_url for %s without fetching",
    async (url) => {
      expect(await fetchAvtonetListing(url)).toEqual({ ok: false, reason: "invalid_url" });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
});
