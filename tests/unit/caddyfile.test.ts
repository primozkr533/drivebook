import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const dir = join(import.meta.dirname, "../../docker/caddy");
const caddyfile = readFileSync(join(dir, "Caddyfile"), "utf8");
const dockerfile = readFileSync(join(dir, "Dockerfile"), "utf8");

describe("Caddyfile", () => {
  it("serves the base domain and its wildcard from one site block", () => {
    expect(caddyfile).toMatch(/^\{\$BASE_DOMAIN\}, \*\.\{\$BASE_DOMAIN\} \{$/m);
  });

  it("sets the ACME e-mail from env in the global options", () => {
    expect(caddyfile).toMatch(/^\{\n\temail \{\$ACME_EMAIL\}\n\}/);
  });

  it("gets the certificate via Cloudflare DNS with the token read only from env", () => {
    expect(caddyfile).toMatch(/tls \{\s*dns cloudflare \{env\.CLOUDFLARE_DNS_API_TOKEN\}\s*\}/);
    expect(caddyfile.match(/dns cloudflare .*/g)).toEqual(["dns cloudflare {env.CLOUDFLARE_DNS_API_TOKEN}"]);
  });

  it("proxies to web:3000 without overriding the Host or forwarded headers", () => {
    expect(caddyfile).toMatch(/^\treverse_proxy web:3000$/m);
    expect(caddyfile.replace(/^\s*#.*$/gm, "")).not.toMatch(/header_up|trusted_proxies/);
  });

  it("compresses responses and sends HSTS", () => {
    expect(caddyfile).toMatch(/^\tencode zstd gzip$/m);
    expect(caddyfile).toMatch(/header Strict-Transport-Security "max-age=\d+/);
  });
});

describe("Caddy Dockerfile", () => {
  it("builds Caddy with the Cloudflare DNS module and ships the Caddyfile", () => {
    expect(dockerfile).toMatch(/^FROM caddy:2-builder AS builder$/m);
    expect(dockerfile).toContain("xcaddy build --with github.com/caddy-dns/cloudflare");
    expect(dockerfile).toMatch(/^FROM caddy:2$/m);
    expect(dockerfile).toContain("COPY --from=builder /usr/bin/caddy /usr/bin/caddy");
    expect(dockerfile).toContain("COPY Caddyfile /etc/caddy/Caddyfile");
  });
});
