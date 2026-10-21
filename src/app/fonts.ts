import { JetBrains_Mono } from "next/font/google";
import localFont from "next/font/local";

// Self-hosted subset (see src/fonts/subset-archivo.py); the wdth axis keeps the 125 % expanded display register.
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
export const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin", "latin-ext"],
  display: "swap",
  variable: "--font-jetbrains-mono",
  preload: false,
});
