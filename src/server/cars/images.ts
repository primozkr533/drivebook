import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import sharp from "sharp";
import { newPublicId } from "@/db/ids";
import { MAX_CAR_IMAGE_BYTES } from "@/lib/car-image-limits";
import { getStorage } from "@/server/storage";

export { MAX_CAR_IMAGE_BYTES };
export const CAR_IMAGE_MAX_WIDTH = 1200;
const WEBP_QUALITY = 80;
const DOWNLOAD_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 5;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

export type CarImageErrorCode = "too_large" | "unsupported_type" | "download_failed" | "blocked_host";

export class CarImageError extends Error {
  constructor(
    readonly code: CarImageErrorCode,
    message: string = code,
  ) {
    super(message);
    this.name = "CarImageError";
  }
}

export type StoredCarImage = { key: string; contentType: "image/webp" };

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  return bytes.length >= offset + signature.length && signature.every((b, i) => bytes[offset + i] === b);
}

const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));

function isAvif(bytes: Uint8Array): boolean {
  if (!startsWith(bytes, ascii("ftyp"), 4)) return false;
  const boxSize = Math.min(((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0, bytes.length, 64);
  const brands = new TextDecoder("latin1").decode(bytes.subarray(8, boxSize));
  return /avi[fs]/.test(brands);
}

export function isSupportedImage(bytes: Uint8Array): boolean {
  return (
    startsWith(bytes, [0xff, 0xd8, 0xff]) ||
    startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) ||
    (startsWith(bytes, ascii("RIFF")) && startsWith(bytes, ascii("WEBP"), 8)) ||
    startsWith(bytes, ascii("GIF87a")) ||
    startsWith(bytes, ascii("GIF89a")) ||
    isAvif(bytes)
  );
}

export async function processCarImage(bytes: Uint8Array): Promise<StoredCarImage> {
  if (bytes.byteLength > MAX_CAR_IMAGE_BYTES) throw new CarImageError("too_large");
  if (!isSupportedImage(bytes)) throw new CarImageError("unsupported_type");

  let webp: Buffer;
  try {
    // sharp drops all metadata (EXIF, GPS, ICC) unless asked to keep it.
    webp = await sharp(bytes)
      .rotate()
      .resize({ width: CAR_IMAGE_MAX_WIDTH, withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();
  } catch {
    throw new CarImageError("unsupported_type", "Image could not be decoded");
  }

  const key = `cars/${newPublicId()}.webp`;
  await getStorage().put(key, webp, "image/webp");
  return { key, contentType: "image/webp" };
}

const blockedIps = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blockedIps.addSubnet(net, prefix, "ipv4");
}
for (const [net, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b::", 96],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  blockedIps.addSubnet(net, prefix, "ipv6");
}

export function isBlockedIp(ip: string): boolean {
  const family = isIP(ip);
  if (family === 0) return true;
  return blockedIps.check(ip, family === 4 ? "ipv4" : "ipv6");
}

async function assertAllowedUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new CarImageError("download_failed", "Invalid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new CarImageError("blocked_host", "Only http(s) URLs");
  if (url.username || url.password) throw new CarImageError("blocked_host", "Credentials in URL");

  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) throw new CarImageError("blocked_host");

  let addresses: string[];
  if (isIP(host)) {
    addresses = [host];
  } else {
    try {
      addresses = (await lookup(host, { all: true, verbatim: true })).map((entry) => entry.address);
    } catch {
      throw new CarImageError("download_failed", "Host could not be resolved");
    }
  }
  if (addresses.length === 0 || addresses.some(isBlockedIp)) throw new CarImageError("blocked_host");
  return url;
}

async function readCapped(response: Response, controller: AbortController): Promise<Uint8Array> {
  if (!response.body) return new Uint8Array(await response.arrayBuffer());
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_CAR_IMAGE_BYTES) {
      controller.abort();
      await reader.cancel().catch(() => {});
      throw new CarImageError("too_large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function downloadImage(url: string): Promise<Uint8Array> {
  let target = await assertAllowedUrl(url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  try {
    let response: Response;
    // Redirects are followed by hand so every hop passes the host check.
    for (let hop = 0; ; hop++) {
      response = await fetch(target, {
        redirect: "manual",
        signal: controller.signal,
        headers: { "User-Agent": USER_AGENT, Accept: "image/avif,image/webp,image/*,*/*;q=0.8" },
      });
      const location = response.headers.get("location");
      if (response.status < 300 || response.status >= 400 || !location) break;
      if (hop >= MAX_REDIRECTS) throw new CarImageError("download_failed", "Too many redirects");
      await response.body?.cancel().catch(() => {});
      target = await assertAllowedUrl(new URL(location, target).toString());
    }

    if (!response.ok) throw new CarImageError("download_failed", `HTTP ${response.status}`);
    const contentType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "";
    if (!contentType.startsWith("image/")) throw new CarImageError("unsupported_type");
    const declaredLength = Number(response.headers.get("content-length"));
    if (declaredLength > MAX_CAR_IMAGE_BYTES) throw new CarImageError("too_large");

    return await readCapped(response, controller);
  } catch (error) {
    if (error instanceof CarImageError) throw error;
    throw new CarImageError("download_failed", controller.signal.aborted ? "Timed out" : "Download failed");
  } finally {
    clearTimeout(timer);
  }
}

export async function storeCarImageFromUrl(url: string): Promise<StoredCarImage> {
  return processCarImage(await downloadImage(url));
}
