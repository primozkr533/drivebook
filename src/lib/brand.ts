import type { CSSProperties } from "react";

const INK = "#10121B";
const PAPER = "#FFFFFF";

function channel(v: number) {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string) {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

export function contrastRatio(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Text colour (ink or paper) that reads best on the given dealer colour. */
export function readableInk(hex: string) {
  return contrastRatio(hex, PAPER) >= contrastRatio(hex, INK) ? PAPER : INK;
}

/**
 * Inline style that re-skins a subtree with a dealer's primary colour.
 * Everything using `brand` / `brand-ink` tokens (primary buttons, the masthead
 * rule, featured-car rule, today's hours marker) follows automatically.
 */
export function brandStyle(hex: string | null | undefined): CSSProperties | undefined {
  if (!hex || !/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex)) return undefined;
  return { "--brand": hex, "--brand-ink": readableInk(hex) } as CSSProperties;
}
