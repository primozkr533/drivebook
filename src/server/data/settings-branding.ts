import { eq } from "drizzle-orm";
import { newPublicId } from "@/db/ids";
import { dealers } from "@/db/schema";
import { requireDealerRole } from "@/server/auth/permissions";
import { getStorage } from "@/server/storage";
import type { DealerContext } from "./context";
import { db } from "./db";
import { withDealerMutation } from "./mutate";

export const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

export type Branding = { primaryColor: string; logoUrl: string | null };

export type UpdatePrimaryColorResult = { ok: true; primaryColor: string } | { ok: false; error: "invalid" };

export type LogoUpload = { bytes: Uint8Array; filename: string; declaredType?: string };

export type LogoError = "empty" | "too_large" | "unsupported_type" | "unsafe_svg";

export type UploadLogoResult = { ok: true; logoUrl: string } | { ok: false; error: LogoError };

type LogoType = { ext: "png" | "jpg" | "webp" | "svg"; contentType: string };

const PNG: LogoType = { ext: "png", contentType: "image/png" };
const JPEG: LogoType = { ext: "jpg", contentType: "image/jpeg" };
const WEBP: LogoType = { ext: "webp", contentType: "image/webp" };
const SVG: LogoType = { ext: "svg", contentType: "image/svg+xml" };

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  return bytes.length >= offset + signature.length && signature.every((b, i) => bytes[offset + i] === b);
}

const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));

function decodeUtf8(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

function isSvgDocument(text: string): boolean {
  const body = text
    .replace(/^﻿/, "")
    .replace(/<\?xml[\s\S]*?\?>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<!DOCTYPE[^>[]*(\[[\s\S]*?\])?\s*>/gi, "")
    .trimStart();
  return /^<svg[\s>/]/i.test(body);
}

function detectLogoType(bytes: Uint8Array): { type: LogoType; svg?: string } | null {
  if (startsWith(bytes, PNG_SIGNATURE)) return { type: PNG };
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return { type: JPEG };
  if (startsWith(bytes, ascii("RIFF")) && startsWith(bytes, ascii("WEBP"), 8)) return { type: WEBP };
  const text = decodeUtf8(bytes);
  if (text !== null && isSvgDocument(text)) return { type: SVG, svg: text };
  return null;
}

// The logo is served from our origin, so anything that could run script or load a third-party resource is refused.
export function isUnsafeSvg(svg: string): boolean {
  if (/<(?:[\w.-]+:)?(?:script|foreignObject|handler)\b/i.test(svg)) return true;
  // Animation can set href to a javascript: URL; a logo has no need for it.
  if (/<(?:[\w.-]+:)?(?:animate|animateMotion|set)\b/i.test(svg)) return true;
  // Character references can hide forbidden words from the checks below.
  if (/&(?!(?:amp|lt|gt|quot|apos);)/.test(svg)) return true;
  if (/javascript:/i.test(svg)) return true;
  if (/[\s"'/:]on[a-z]+\s*=/i.test(svg)) return true;
  if (/<!ENTITY/i.test(svg)) return true;
  if (/\bhref\s*=\s*(?!["']?\s*#)/i.test(svg)) return true;
  if (/url\(\s*(?!["']?\s*#)/i.test(svg) || /@import/i.test(svg)) return true;
  return false;
}

export function normalizeHexColor(raw: string): string | null {
  const value = raw.trim();
  return HEX_COLOR_RE.test(value) ? value.toUpperCase() : null;
}

async function deleteQuietly(key: string): Promise<void> {
  try {
    await getStorage().delete(key);
  } catch (error) {
    console.error(`[branding] failed to delete logo ${key}`, error);
  }
}

export async function getBranding(ctx: DealerContext): Promise<Branding | null> {
  await requireDealerRole(ctx, ["owner"]);
  const [dealer] = await db()
    .select({ primaryColor: dealers.primaryColor, logoKey: dealers.logoKey })
    .from(dealers)
    .where(eq(dealers.id, ctx.dealerId))
    .limit(1);
  if (!dealer) return null;
  return {
    primaryColor: dealer.primaryColor,
    logoUrl: dealer.logoKey ? getStorage().url(dealer.logoKey) : null,
  };
}

export async function updatePrimaryColor(ctx: DealerContext, hex: string): Promise<UpdatePrimaryColorResult> {
  const actor = await requireDealerRole(ctx, ["owner"]);
  const primaryColor = normalizeHexColor(hex);
  if (!primaryColor) return { ok: false, error: "invalid" };

  await withDealerMutation(
    ctx,
    async (tx) => {
      await tx.update(dealers).set({ primaryColor, updatedAt: new Date() }).where(eq(dealers.id, ctx.dealerId));
    },
    {
      action: "dealer.settings.branding.color",
      entity: "dealer",
      entityId: ctx.dealerId,
      actorKind: "dealer_user",
      actorId: actor.userId,
      data: { primaryColor },
    },
  );
  return { ok: true, primaryColor };
}

async function replaceLogoKey(ctx: DealerContext, actorId: string, logoKey: string | null): Promise<string | null> {
  return withDealerMutation(ctx, async (tx) => {
    const [current] = await tx
      .select({ logoKey: dealers.logoKey })
      .from(dealers)
      .where(eq(dealers.id, ctx.dealerId))
      .for("update");
    await tx.update(dealers).set({ logoKey, updatedAt: new Date() }).where(eq(dealers.id, ctx.dealerId));
    return current?.logoKey ?? null;
  }, {
    action: logoKey ? "dealer.settings.branding.logo.upload" : "dealer.settings.branding.logo.remove",
    entity: "dealer",
    entityId: ctx.dealerId,
    actorKind: "dealer_user",
    actorId,
    data: { logoKey },
  });
}

export async function uploadLogo(ctx: DealerContext, upload: LogoUpload): Promise<UploadLogoResult> {
  const actor = await requireDealerRole(ctx, ["owner"]);
  const { bytes } = upload;
  if (bytes.byteLength === 0) return { ok: false, error: "empty" };
  if (bytes.byteLength > MAX_LOGO_BYTES) return { ok: false, error: "too_large" };

  // The filename and declared type come from the client and are never trusted.
  const detected = detectLogoType(bytes);
  if (!detected) return { ok: false, error: "unsupported_type" };
  if (detected.svg !== undefined && isUnsafeSvg(detected.svg)) return { ok: false, error: "unsafe_svg" };

  const key = `logos/${newPublicId()}.${detected.type.ext}`;
  const storage = getStorage();
  await storage.put(key, bytes, detected.type.contentType);

  let previousKey: string | null;
  try {
    previousKey = await replaceLogoKey(ctx, actor.userId, key);
  } catch (error) {
    await deleteQuietly(key);
    throw error;
  }
  if (previousKey && previousKey !== key) await deleteQuietly(previousKey);
  return { ok: true, logoUrl: storage.url(key) };
}

export async function removeLogo(ctx: DealerContext): Promise<{ ok: true }> {
  const actor = await requireDealerRole(ctx, ["owner"]);
  const previousKey = await replaceLogoKey(ctx, actor.userId, null);
  if (previousKey) await deleteQuietly(previousKey);
  return { ok: true };
}
