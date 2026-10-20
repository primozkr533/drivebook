import type { CSSProperties } from "react";

/**
 * Per-dealer branding. A dealer picks any primary colour; we derive the text
 * colour that sits on it so buttons stay readable (WCAG AA, 4.5:1).
 * Spread brandScope() on the public-page wrapper; components only ever
 * read --brand / --brand-ink / --brand-soft (see tokens.css).
 */
const INK_DARK = "#10201a"; // mirrors --ink (light theme)
const INK_LIGHT = "#ffffff";

function luminance(hex: string): number {
  const n = hex.replace("#", "");
  const full = n.length === 3 ? n.split("").map((c) => c + c).join("") : n;
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(full.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

/** Text colour for a given brand colour — whichever of white / ink contrasts more. */
export function brandInk(hex: string): string {
  return contrastRatio(hex, INK_LIGHT) >= contrastRatio(hex, INK_DARK) ? INK_LIGHT : INK_DARK;
}

export function isValidHex(hex: string): boolean {
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex);
}

/**
 * Props for a dealer-brand scope: spread on the public-page wrapper.
 * `data-brand` makes tokens.css re-derive --brand-soft / --brand-line inside it.
 *   <div {...brandScope(dealer.primaryColor)}>…</div>
 */
export function brandScope(hex: string | null | undefined): { "data-brand"?: string; style?: CSSProperties } {
  if (!hex || !isValidHex(hex)) return {};
  return { "data-brand": "", style: { "--brand": hex, "--brand-ink": brandInk(hex) } as CSSProperties };
}
