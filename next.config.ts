import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// A car image may be up to 10 MB (logos 2 MB); leave room for multipart overhead and the other fields.
const REQUEST_BODY_SIZE_LIMIT = "12mb";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  serverExternalPackages: ["pg", "pg-boss", "sharp"],
  experimental: {
    serverActions: { bodySizeLimit: REQUEST_BODY_SIZE_LIMIT },
    // Server-action POSTs pass through src/proxy.ts, which truncates bodies above this limit.
    proxyClientMaxBodySize: REQUEST_BODY_SIZE_LIMIT,
  },
};

export default withNextIntl(nextConfig);
