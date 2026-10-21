import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { archivo, jetbrainsMono } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "DriveBook",
  description: "Naročanje na testne vožnje in oglede vozil za avtohiše.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F2F1EE" },
    { media: "(prefers-color-scheme: dark)", color: "#13110F" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sl" className={`${archivo.variable} ${jetbrainsMono.variable}`} suppressHydrationWarning>
      <body>
        {/* Messages reach the client only under the admin (app) layouts; public pages ship none. */}
        <NextIntlClientProvider messages={null}>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
