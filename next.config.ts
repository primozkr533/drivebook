import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  serverExternalPackages: ["pg", "pg-boss"],
  // A logo may be up to 2 MB; the default 1 MB limit would reject it before the action runs.
  experimental: { serverActions: { bodySizeLimit: "3mb" } },
};

export default withNextIntl(nextConfig);
