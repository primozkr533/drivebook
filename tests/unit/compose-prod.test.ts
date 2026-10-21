import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "../..");
const compose = readFileSync(join(root, "docker-compose.prod.yml"), "utf8");
const local = readFileSync(join(root, "docker-compose.prod.local.yml"), "utf8");

const STORAGE_MOUNT = ["", "data", "storage"].join("/");
const SERVICES = ["db", "migrate", "web", "worker", "backup", "caddy"];
const PROVIDER_KEYS = [
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_FROM_NUMBER",
  "BREVO_API_KEY",
  "BREVO_SENDER_EMAIL",
  "BREVO_SENDER_NAME",
  "CLOUDFLARE_API_TOKEN",
  "CLOUDFLARE_ZONE_ID",
  "CLOUDFLARE_DNS_API_TOKEN",
];

function block(text: string, name: string, indent: string): string {
  const match = text.match(new RegExp(`^${indent}${name}:\\n((?:${indent}  .*\\n|\\s*\\n)*)`, "m"));
  if (!match) throw new Error(`${name} not found`);
  return match[1];
}

const service = (name: string) => block(compose, name, "  ");
const appEnv = compose.match(/^x-app-env: &app-env\n((?: {2}.*\n)*)/m)?.[1] ?? "";

describe("docker-compose.prod.yml", () => {
  it("defines the production services", () => {
    for (const name of SERVICES) expect(() => service(name)).not.toThrow();
  });

  it("builds migrate, web and worker from the root Dockerfile as one image", () => {
    expect(compose).toMatch(/^x-app-build: &app-build\n {2}build: \.\n {2}image: \S+\n/m);
    expect(service("migrate")).toContain('command: ["npm", "run", "db:migrate"]');
    expect(service("web")).toContain('command: ["node", "server.js"]');
    expect(service("worker")).toContain('command: ["npm", "run", "worker"]');
    for (const name of ["migrate", "web", "worker"]) {
      expect(service(name)).toContain("<<: *app-build");
      expect(service(name)).toContain("environment: *app-env");
    }
  });

  it("runs migrate once after db is healthy; web and worker wait for it to complete", () => {
    expect(service("migrate")).toMatch(/db:\n\s+condition: service_healthy/);
    expect(service("migrate")).toMatch(/restart: "no"/);
    for (const name of ["web", "worker"]) {
      expect(service(name)).toMatch(/depends_on:\n\s+migrate:\n\s+condition: service_completed_successfully/);
    }
  });

  it("keeps web independent of the worker", () => {
    expect(service("web")).not.toMatch(/worker/);
  });

  it("publishes ports only from caddy (80, 443, 443/udp)", () => {
    for (const name of SERVICES.filter((s) => s !== "caddy")) {
      expect(service(name), name).not.toMatch(/ports:/);
    }
    const caddy = service("caddy");
    for (const port of ['"80:80"', '"443:443"', '"443:443/udp"']) expect(caddy).toContain(`- ${port}`);
    expect(caddy).toMatch(/build: docker\/caddy/);
    expect(caddy).toMatch(/- caddy-data:\/data\n\s+- caddy-config:\/config/);
    expect(caddy).toMatch(/web:\n\s+condition: service_started/);
  });

  it("uses restart: unless-stopped everywhere except migrate", () => {
    for (const name of SERVICES.filter((s) => s !== "migrate")) {
      expect(service(name), name).toContain("restart: unless-stopped");
    }
  });

  it("runs postgres 17 from env credentials with a healthcheck and a named volume", () => {
    const db = service("db");
    expect(db).toContain("image: postgres:17-alpine");
    expect(readFileSync(join(root, "docker-compose.yml"), "utf8")).toContain("image: postgres:17-alpine");
    for (const name of ["POSTGRES_USER", "POSTGRES_PASSWORD", "POSTGRES_DB"]) {
      expect(db).toMatch(new RegExp(`- ${name}=\\$\\{${name}:[-?]`));
    }
    expect(db).toContain("- db-data:/var/lib/postgresql/data");
    expect(db).toContain("healthcheck:");
  });

  it("gives web the storage volume and a healthcheck", () => {
    expect(service("web")).toContain(`- storage:${STORAGE_MOUNT}\n`);
    expect(service("web")).toContain("healthcheck:");
    expect(service("worker")).not.toContain(`storage:${STORAGE_MOUNT}`);
  });

  it("mounts storage read-only and the backups volume in backup", () => {
    const backup = service("backup");
    expect(backup).toContain("build: docker/backup");
    expect(backup).toContain(`- storage:${STORAGE_MOUNT}:ro`);
    expect(backup).toContain("- backups:/backups");
    expect(backup).toMatch(/- DATABASE_URL=\$\{DATABASE_URL:-/);
  });

  it("declares every named volume", () => {
    const volumes = block(compose, "volumes", "");
    for (const name of ["db-data", "storage", "backups", "caddy-data", "caddy-config"]) {
      expect(volumes).toContain(`  ${name}:`);
    }
  });

  it("sets the production app env with the app's variable names", () => {
    for (const line of [
      "- APP_ENV=production",
      "- PUBLIC_URL_SCHEME=https",
      "- RUN_MIGRATIONS_ON_START=0",
      "- SEED_ON_START=${SEED_ON_START:-0}",
      `- STORAGE_DIR=${STORAGE_MOUNT}`,
      "- ALLOW_FAKE_PROVIDERS=${ALLOW_FAKE_PROVIDERS:-}",
      "- NOTIFY_FAKE=${NOTIFY_FAKE:-}",
    ]) {
      expect(appEnv).toContain(line);
    }
    for (const name of ["DATABASE_URL", "BASE_DOMAIN", "AUTH_SECRET", "SEED_SUPERADMIN_EMAIL"]) {
      expect(appEnv).toMatch(new RegExp(`- ${name}=\\$\\{${name}[:?-]`));
    }
  });

  it("interpolates every provider key, never pinning it empty", () => {
    for (const text of [compose, local]) {
      expect(text).not.toMatch(/^\s*-\s*(TWILIO|BREVO|CLOUDFLARE)_[A-Z_]*=\s*$/m);
      for (const match of text.matchAll(/^\s*-\s*((?:TWILIO|BREVO|CLOUDFLARE)_[A-Z_]*)(=.*)?$/gm)) {
        const [, name, value] = match;
        if (value !== undefined) expect(value).toMatch(new RegExp(`^=\\$\\{${name}:-[^}]*\\}$`));
      }
    }
    for (const name of PROVIDER_KEYS.filter((key) => key !== "CLOUDFLARE_DNS_API_TOKEN")) {
      expect(appEnv).toContain(`- ${name}=\${${name}:-`);
    }
  });

  it("gives CLOUDFLARE_DNS_API_TOKEN and ACME_EMAIL to caddy only", () => {
    expect(service("caddy")).toContain("- CLOUDFLARE_DNS_API_TOKEN=${CLOUDFLARE_DNS_API_TOKEN:-}");
    expect(service("caddy")).toContain("- ACME_EMAIL=${ACME_EMAIL:-}");
    for (const name of ["CLOUDFLARE_DNS_API_TOKEN", "ACME_EMAIL"]) {
      expect(compose.match(new RegExp(`- ${name}=`, "g"))).toHaveLength(1);
    }
  });
});

describe("docker-compose.prod.local.yml", () => {
  it("runs locally with fake providers, drivebook.localhost and Caddy internal TLS", () => {
    expect(local).toContain("- ALLOW_FAKE_PROVIDERS=1");
    expect(local).toContain("- BASE_DOMAIN=drivebook.localhost");
    expect(local).toContain("./docker/caddy/Caddyfile.local:/etc/caddy/Caddyfile:ro");
    const caddyfile = readFileSync(join(root, "docker/caddy/Caddyfile.local"), "utf8");
    expect(caddyfile).toMatch(/^\{\$BASE_DOMAIN\}, \*\.\{\$BASE_DOMAIN\} \{$/m);
    expect(caddyfile).toMatch(/^\ttls internal$/m);
    expect(caddyfile).toMatch(/^\treverse_proxy web:3000$/m);
  });
});
