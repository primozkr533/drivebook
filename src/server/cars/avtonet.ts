import { type HTMLElement, parse } from "node-html-parser";
import { ljubljanaNow } from "@/lib/date";

export type AvtonetFields = {
  make?: string;
  model?: string;
  year?: number;
  priceEur?: number;
  imageUrl?: string;
};

export type AvtonetFailure = "invalid_url" | "blocked" | "timeout" | "http_error" | "parse_failed";

export type AvtonetResult = { ok: true; fields: AvtonetFields } | { ok: false; reason: AvtonetFailure };

export const AVTONET_TIMEOUT_MS = 10_000;

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

const TWO_WORD_MAKES = [
  "Alfa Romeo",
  "Aston Martin",
  "Land Rover",
  "Range Rover",
  "Rolls Royce",
  "Lynk & Co",
  "DS Automobiles",
];

const HYPHENATED_MAKES: Record<string, string> = {
  "mercedes-benz": "Mercedes-Benz",
  "mercedes benz": "Mercedes-Benz",
  "rolls-royce": "Rolls-Royce",
};

export function isAvtonetUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
  const host = parsed.hostname.toLowerCase();
  return host === "avto.net" || host.endsWith(".avto.net");
}

type JsonLd = Record<string, unknown>;

function clean(s: string | undefined | null): string | undefined {
  const v = s?.replace(/\s+/g, " ").trim();
  return v ? v : undefined;
}

function metaContent(root: HTMLElement, key: string): string | undefined {
  for (const m of root.querySelectorAll("meta")) {
    const name = (m.getAttribute("property") ?? m.getAttribute("name") ?? "").toLowerCase();
    if (name === key) {
      const v = clean(m.getAttribute("content"));
      if (v) return v;
    }
  }
  return undefined;
}

function jsonLdNodes(root: HTMLElement): JsonLd[] {
  const out: JsonLd[] = [];
  const visit = (node: unknown) => {
    if (Array.isArray(node)) node.forEach(visit);
    else if (node && typeof node === "object") {
      out.push(node as JsonLd);
      const graph = (node as JsonLd)["@graph"];
      if (graph) visit(graph);
    }
  };
  for (const s of root.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      visit(JSON.parse(s.rawText));
    } catch {
      // Malformed JSON-LD is common; skip it.
    }
  }
  return out;
}

function ldString(v: unknown): string | undefined {
  if (typeof v === "string") return clean(v);
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) return ldString(v[0]);
  if (v && typeof v === "object") {
    const o = v as JsonLd;
    return ldString(o.name ?? o.url ?? o.price);
  }
  return undefined;
}

function ldValues(nodes: JsonLd[], keys: string[]): string[] {
  const out: string[] = [];
  for (const n of nodes) {
    for (const k of keys) {
      const v = ldString(n[k]);
      if (v) out.push(v);
    }
  }
  return out;
}

function stripSiteSuffix(title: string): string {
  return title.replace(/\s*[-|–—:]\s*(www\.)?avto\.net.*$/i, "").trim();
}

function splitMakeModel(title: string): { make?: string; model?: string } {
  const t = stripSiteSuffix(title);
  if (!t) return {};
  const lower = t.toLowerCase();
  let make: string | undefined;
  let rest = "";
  for (const [key, canonical] of Object.entries(HYPHENATED_MAKES)) {
    if (lower === key || lower.startsWith(`${key} `)) {
      make = canonical;
      rest = t.slice(key.length);
      break;
    }
  }
  if (!make) {
    for (const m of TWO_WORD_MAKES) {
      const k = m.toLowerCase();
      if (lower === k || lower.startsWith(`${k} `)) {
        make = t.slice(0, m.length);
        rest = t.slice(m.length);
        break;
      }
    }
  }
  if (!make) {
    const [first, ...others] = t.split(" ");
    make = first;
    rest = others.join(" ");
  }
  return { make: clean(make), model: modelFrom(rest) };
}

// Titles carry engine/trim after the model ("Octavia Combi 2.0 TDI Style"); keep the model words only.
function modelFrom(rest: string): string | undefined {
  const words = rest.split(/[,|(]/)[0].trim().split(/\s+/).filter(Boolean);
  const out: string[] = [];
  for (const w of words) {
    if (out.length > 0 && /\d/.test(w)) break;
    out.push(w);
  }
  return clean(out.join(" "));
}

function parseYear(texts: string[], maxYear: number): number | undefined {
  const inRange = (s: string) => {
    const n = Number(s);
    return n >= 1950 && n <= maxYear ? n : undefined;
  };
  for (const t of texts) {
    const m = /(?:1\.\s*registracija|prva\s+registracija|letnik)\D{0,20}?(?:\d{1,2}\s*[./]\s*)?(\d{4})\b/i.exec(t);
    const y = m && inRange(m[1]);
    if (y) return y;
  }
  for (const t of texts) {
    if (/^\d{4}(-\d{2}(-\d{2})?)?/.test(t)) {
      const y = inRange(t.slice(0, 4));
      if (y) return y;
    }
  }
  for (const t of texts) {
    for (const m of t.matchAll(/(?<![\d.,])(\d{4})(?![\d.,])(?!\s*(?:ccm|cm3|km|kw|€|eur))/gi)) {
      const y = inRange(m[1]);
      if (y) return y;
    }
  }
  return undefined;
}

function priceNumber(s: string): number | undefined {
  const normalized = s.replace(/[.\s ]/g, "").replace(/,\d{1,2}$/, "");
  const n = Number(normalized);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

const PRICE_AMOUNT = String.raw`(\d{1,3}(?:[.\s ]\d{3})+|\d+)(?:,\d{1,2})?`;
const PRICE_AFTER = new RegExp(`${PRICE_AMOUNT}\\s*(?:€|EUR)`, "i");
const PRICE_BEFORE = new RegExp(`(?:€|EUR)\\s*${PRICE_AMOUNT}`, "i");

function parsePriceText(text: string): number | undefined {
  const m = PRICE_AFTER.exec(text) ?? PRICE_BEFORE.exec(text);
  return m ? priceNumber(m[1]) : undefined;
}

function parsePlainPrice(s: string): number | undefined {
  if (/^\d+(\.\d{1,2})?$/.test(s)) {
    const n = Math.round(Number(s));
    return n > 0 ? n : undefined;
  }
  return priceNumber(s.replace(/[^\d.,\s]/g, "").trim());
}

function visiblePriceText(root: HTMLElement): string[] {
  const out: string[] = [];
  for (const el of root.querySelectorAll("[class], [id]")) {
    const marker = `${el.getAttribute("class") ?? ""} ${el.getAttribute("id") ?? ""}`;
    if (/price|cena/i.test(marker)) {
      const t = clean(el.text);
      if (t) out.push(t);
    }
  }
  const body = clean(root.querySelector("body")?.text);
  if (body) out.push(body);
  return out;
}

function absoluteHttpUrl(src: string, base: string): string | undefined {
  try {
    const u = new URL(src, base);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

function firstDefined<T>(candidates: Array<() => T | undefined>): T | undefined {
  for (const c of candidates) {
    const v = c();
    if (v !== undefined) return v;
  }
  return undefined;
}

export function parseAvtonetHtml(html: string, pageUrl: string, now: Date = new Date()): AvtonetFields {
  try {
    return parseUnsafe(html, pageUrl, now);
  } catch {
    return {};
  }
}

function parseUnsafe(html: string, pageUrl: string, now: Date): AvtonetFields {
  const root = parse(html);
  const ld = jsonLdNodes(root);
  root.querySelectorAll("script, style, noscript, template").forEach((el) => el.remove());

  const meta = (k: string) => metaContent(root, k);
  const descriptions = [meta("og:description"), meta("twitter:description"), meta("description")].filter(
    (s): s is string => !!s,
  );
  const titles = [
    meta("og:title"),
    meta("twitter:title"),
    ...ldValues(ld, ["name"]),
    clean(root.querySelector("title")?.text),
    clean(root.querySelector("h1")?.text),
  ].filter((s): s is string => !!s);

  const fields: AvtonetFields = {};

  const ldMake = ldValues(ld, ["brand", "manufacturer"])[0];
  const ldModel = ldValues(ld, ["model"])[0];
  const fromTitle = titles.map(splitMakeModel).find((r) => r.make) ?? {};
  if (fromTitle.make) {
    fields.make = fromTitle.make;
    fields.model = fromTitle.model;
  } else if (ldMake) {
    fields.make = ldMake;
    fields.model = ldModel;
  }

  const maxYear = Number(ljubljanaNow(now).dateISO.slice(0, 4)) + 1;
  fields.year = parseYear(
    [
      ...descriptions,
      ...ldValues(ld, ["dateVehicleFirstRegistered", "vehicleModelDate", "productionDate", "modelDate"]),
      ...titles,
      clean(root.querySelector("body")?.text) ?? "",
    ],
    maxYear,
  );

  fields.priceEur = firstDefined<number>([
    () => {
      const m = meta("product:price:amount") ?? meta("og:price:amount");
      return m ? parsePlainPrice(m) : undefined;
    },
    ...descriptions.map((d) => () => parsePriceText(d)),
    () => {
      for (const n of ld) {
        const offers = Array.isArray(n.offers) ? n.offers[0] : n.offers;
        const p = offers && typeof offers === "object" ? ldString((offers as JsonLd).price) : undefined;
        const v = p ? parsePlainPrice(p) : undefined;
        if (v) return v;
      }
      return undefined;
    },
    ...visiblePriceText(root).map((t) => () => parsePriceText(t)),
  ]);

  const imageSrc =
    meta("og:image:secure_url") ??
    meta("og:image") ??
    meta("twitter:image") ??
    meta("twitter:image:src") ??
    ldValues(ld, ["image"])[0];
  fields.imageUrl = imageSrc ? absoluteHttpUrl(imageSrc, pageUrl) : undefined;

  return Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined)) as AvtonetFields;
}

const STRONG_BLOCK_MARKERS =
  /cf-chl|challenge-platform|just a moment\.\.\.|attention required|pardon our interruption|captcha-delivery|_incapsula_resource|access denied/i;
const WEAK_BLOCK_MARKERS = /captcha|robot|bot/i;

export async function fetchAvtonetListing(url: string): Promise<AvtonetResult> {
  if (!isAvtonetUrl(url)) return { ok: false, reason: "invalid_url" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AVTONET_TIMEOUT_MS);
  let status: number;
  let html: string;
  let finalUrl = url;
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": USER_AGENT,
        "Accept-Language": "sl,en",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    status = res.status;
    if (res.url) finalUrl = res.url;
    html = res.ok ? await res.text() : "";
  } catch {
    return { ok: false, reason: controller.signal.aborted ? "timeout" : "http_error" };
  } finally {
    clearTimeout(timer);
  }

  if (status === 403 || status === 429) return { ok: false, reason: "blocked" };
  if (status < 200 || status >= 300) return { ok: false, reason: "http_error" };
  if (!isAvtonetUrl(finalUrl)) return { ok: false, reason: "blocked" };
  if (STRONG_BLOCK_MARKERS.test(html)) return { ok: false, reason: "blocked" };

  const fields = parseAvtonetHtml(html, finalUrl);
  if (Object.keys(fields).length === 0) {
    // A real listing can mention reCAPTCHA in its contact form, so weak markers only count when nothing parsed.
    return { ok: false, reason: WEAK_BLOCK_MARKERS.test(html) ? "blocked" : "parse_failed" };
  }
  return { ok: true, fields };
}
