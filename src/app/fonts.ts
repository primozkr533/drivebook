import localFont from "next/font/local";

// Self-hosted Latin + Latin Extended-A subsets (src/fonts/subset-font.py); the wdth axis keeps the 125 % display register.
export const archivo = localFont({
  src: "../fonts/archivo-latin-ext.woff2",
  weight: "400 800",
  style: "normal",
  display: "swap",
  variable: "--font-archivo",
  declarations: [{ prop: "font-stretch", value: "100% 125%" }],
  adjustFontFallback: "Arial",
});

// Mono only labels small utility text, so it is not preloaded for the first viewport.
export const jetbrainsMono = localFont({
  src: "../fonts/jetbrains-mono-latin-ext.woff2",
  weight: "400 800",
  style: "normal",
  display: "swap",
  variable: "--font-jetbrains-mono",
  preload: false,
  adjustFontFallback: false,
});
