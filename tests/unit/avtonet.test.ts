import { describe, expect, it } from "vitest";
import { normalizeAvtoNetUrl, parseListingHtml, readListing } from "@/server/avtonet";

describe("normalizeAvtoNetUrl", () => {
  it("canonicalises avto.net listing links", () => {
    expect(normalizeAvtoNetUrl("https://www.avto.net/Ads/details.asp?id=20512345&display=Skoda")).toBe(
      "https://www.avto.net/Ads/details.asp?id=20512345",
    );
    expect(normalizeAvtoNetUrl(" http://avto.net/ads/details.asp?ID=42 ")).toBe("https://www.avto.net/Ads/details.asp?id=42");
  });

  it("rejects other sites, other pages and missing ids", () => {
    expect(normalizeAvtoNetUrl("https://www.avto.net.evil.com/Ads/details.asp?id=1")).toBeNull();
    expect(normalizeAvtoNetUrl("https://www.avto.net/Ads/results.asp?znamka=Audi")).toBeNull();
    expect(normalizeAvtoNetUrl("https://www.avto.net/Ads/details.asp?id=abc")).toBeNull();
    expect(normalizeAvtoNetUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeAvtoNetUrl("ni povezava")).toBeNull();
  });
});

const LISTING = `<!doctype html><html><head>
<title>Škoda Octavia Combi 2.0 TDI Style - Avto.net</title>
<meta property="og:image" content="https://images.avto.net/photo/123.jpg">
</head><body>
<h1>Škoda Octavia Combi 2.0 TDI Style</h1>
<table><tr><th>Prva registracija:</th><td>2021</td></tr>
<tr><th>Prevoženih km:</th><td>87.400 km</td></tr></table>
<p class="price">Cena: 18.900 €</p>
</body></html>`;

describe("parseListingHtml", () => {
  it("reads make, model, year, mileage, price and photo", () => {
    expect(parseListingHtml(LISTING)).toEqual({
      make: "Škoda",
      model: "Octavia Combi 2.0 TDI Style",
      year: 2021,
      mileageKm: 87400,
      priceEur: 18900,
      imageUrl: "https://images.avto.net/photo/123.jpg",
    });
  });

  it("returns null for a page without a usable title (e.g. a bot challenge)", () => {
    expect(parseListingHtml("<html><head><title>Just a moment...</title></head></html>")).toBeNull();
  });

  it("readListing returns null when the fetch is refused", async () => {
    expect(await readListing("https://www.avto.net/Ads/details.asp?id=1", async () => null)).toBeNull();
  });
});
