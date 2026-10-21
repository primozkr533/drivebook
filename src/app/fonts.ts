import { Archivo, JetBrains_Mono } from "next/font/google";

// Self-hosted at build time; wdth keeps the 125 % expanded display register.
export const archivo = Archivo({
  subsets: ["latin", "latin-ext"],
  axes: ["wdth"],
  display: "swap",
  variable: "--font-archivo",
});

// Mono only labels small utility text, so it is not preloaded for the first viewport.
export const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin", "latin-ext"],
  display: "swap",
  variable: "--font-jetbrains-mono",
  preload: false,
});
