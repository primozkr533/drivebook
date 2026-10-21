import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  serverExternalPackages: ["pg", "pg-boss", "sharp"],
  // A car image may be up to 10 MB (logos 2 MB); leave room for multipart overhead and the other fields.
  experimental: { serverActions: { bodySizeLimit: "12mb" } },
};

export default withNextIntl(nextConfig);
