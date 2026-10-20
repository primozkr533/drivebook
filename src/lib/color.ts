import type { CSSProperties } from "react";

/**
 * Dealer branding helpers. A dealer picks any primary colour; we must keep
 * button text readable on it (WCAG contrast), so --on-brand is derived, never chosen.
 */

const INK = "#17140F"; // keep in sync with --ink (light) in tokens.css
const PAPER = "#FBFAF8"; // keep in sync with --surface (light) in tokens.css

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((x) => x + x).join("") : h;
  const n = parseInt(full, 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** The more readable of ink / paper on the given background. */
export function readableInk(bg: string): string {
  return contrast(bg, INK) >= contrast(bg, PAPER) ? INK : PAPER;
}

/** CSS custom properties that re-brand a subtree with a dealer colour. */
export function brandStyle(hex: string): CSSProperties {
  return { ["--brand" as string]: hex, ["--on-brand" as string]: readableInk(hex) };
}
