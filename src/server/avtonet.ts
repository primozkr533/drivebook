// Reads basic car data from an avto.net listing. avto.net often refuses server-side requests
// (bot protection), so every caller must handle `null` and let the dealer enter the data by hand.

export type ListingDetails = {
  make: string | null;
  model: string | null;
  year: number | null;
  mileageKm: number | null;
  priceEur: number | null;
  imageUrl: string | null;
};

export type ListingFetcher = (url: string) => Promise<string | null>;

const AVTO_NET_HOSTS = new Set(["avto.net", "www.avto.net"]);
const FETCH_TIMEOUT_MS = 8000;
const MAX_HTML_BYTES = 2_000_000;

/** Canonical `https://www.avto.net/Ads/details.asp?id=<n>`, or null when the URL is not an avto.net listing. */
export function normalizeAvtoNetUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (!AVTO_NET_HOSTS.has(url.hostname.toLowerCase())) return null;
  if (url.pathname.toLowerCase() !== "/ads/details.asp") return null;
  const id = url.searchParams.get("id") ?? url.searchParams.get("ID");
  if (!id || !/^\d{1,12}$/.test(id)) return null;
  return `https://www.avto.net/Ads/details.asp?id=${id}`;
}

export const fetchListingHtml: ListingFetcher = async (url) => {
  try {
    const res = await fetch(url, {
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; DriveBook/1.0; +https://drivebook.si)",
        "accept-language": "sl-SI,sl;q=0.9",
        accept: "text/html",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const html = await res.text();
    return html.length > MAX_HTML_BYTES ? html.slice(0, MAX_HTML_BYTES) : html;
  } catch {
    return null;
  }
};

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", euro: "€" };

function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

function meta(html: string, property: string): string | null {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${property}["'][^>]*content=["']([^"']*)["']|<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${property}["']`,
    "i",
  );
  const m = re.exec(html);
  const value = m ? (m[1] ?? m[2]) : null;
  return value ? decodeEntities(value).trim() || null : null;
}

function toInt(digits: string): number | null {
  const n = Number(digits.replace(/[.\s ]/g, ""));
  return Number.isSafeInteger(n) ? n : null;
}

const MIN_YEAR = 1950;

export function parseListingHtml(html: string): ListingDetails | null {
  const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  const rawTitle = (h1 && stripTags(h1[1])) || meta(html, "og:title") || (/<title>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "");
  const title = stripTags(rawTitle)
    .replace(/\s*[-|]\s*avto\.net.*$/i, "")
    .trim();
  const text = stripTags(html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " "));

  const yearMatch = /(?:1\.\s*registracij[ae]|Letnik(?:\s*1\.\s*registracije)?|Prva registracija)\s*:?\s*(?:\d{1,2}\s*\/\s*)?(\d{4})/i.exec(text);
  const year = yearMatch ? Number(yearMatch[1]) : null;
  const kmMatch = /(?:Prevo[žz]enih|Prevo[žz]eni)\s*(?:km)?\s*:?\s*([\d.\s ]{1,12})\s*km/i.exec(text);
  const priceMatch = /(?:Cena|Akcijska cena|Redna cena)\s*:?\s*([\d.\s ]{3,12})\s*(?:€|EUR)/i.exec(text) ?? /([\d]{1,3}(?:\.\d{3})+)\s*€/.exec(text);
  const image = meta(html, "og:image");

  const words = title.split(" ").filter(Boolean);
  const details: ListingDetails = {
    make: words[0] ?? null,
    model: words.length > 1 ? words.slice(1).join(" ") : null,
    year: year && year >= MIN_YEAR && year <= 2100 ? year : null,
    mileageKm: kmMatch ? toInt(kmMatch[1]) : null,
    priceEur: priceMatch ? toInt(priceMatch[1]) : null,
    imageUrl: image && /^https:\/\//i.test(image) ? image : null,
  };
  // A real listing has a title and at least one listing fact; a bot-challenge page has neither.
  const hasFacts = details.year !== null || details.mileageKm !== null || details.priceEur !== null;
  return details.make && details.model && hasFacts ? details : null;
}

export async function readListing(url: string, fetcher: ListingFetcher = fetchListingHtml): Promise<ListingDetails | null> {
  const html = await fetcher(url);
  return html ? parseListingHtml(html) : null;
}
