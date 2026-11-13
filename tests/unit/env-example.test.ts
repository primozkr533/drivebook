import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const lines = readFileSync(join(import.meta.dirname, "../../.env.example"), "utf8").split("\n");

const DOCUMENTED = [
  "DATABASE_URL",
  "TEST_DATABASE_URL",
  "APP_ENV",
  "BASE_DOMAIN",
  "RUN_MIGRATIONS_ON_START",
  "SEED_ON_START",
  "SEED_SUPERADMIN_EMAIL",
  "AUTH_SECRET",
  "FARM_TEST_AUTH",
  "DEV_INBOX_ENABLED",
  "NOTIFY_FAKE",
  "ALLOW_FAKE_PROVIDERS",
  "PUBLIC_URL_SCHEME",
  "PUBLIC_URL_PORT",
  "STORAGE_DIR",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_FROM_NUMBER",
  "BREVO_API_KEY",
  "BREVO_SENDER_EMAIL",
  "BREVO_SENDER_NAME",
  "CLOUDFLARE_API_TOKEN",
  "CLOUDFLARE_ZONE_ID",
  "ACME_EMAIL",
  "CLOUDFLARE_DNS_API_TOKEN",
  "POSTGRES_USER",
  "POSTGRES_PASSWORD",
  "POSTGRES_DB",
  "BACKUP_RETENTION_DAYS",
];

const PROVIDER_KEYS = [
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_FROM_NUMBER",
  "BREVO_API_KEY",
  "BREVO_SENDER_EMAIL",
  "CLOUDFLARE_API_TOKEN",
  "CLOUDFLARE_ZONE_ID",
  "CLOUDFLARE_DNS_API_TOKEN",
];

function lineIndex(name: string): number {
  return lines.findIndex((line) => line.startsWith(`${name}=`));
}

describe(".env.example", () => {
  it.each(DOCUMENTED)("documents %s with a comment line", (name) => {
    const index = lineIndex(name);
    expect(index, name).toBeGreaterThan(0);
    expect(lines[index - 1]).toMatch(/^# \S/);
  });

  it.each(PROVIDER_KEYS)("leaves %s empty", (name) => {
    expect(lines[lineIndex(name)]).toBe(`${name}=`);
  });

  it.each(["AUTH_SECRET", "POSTGRES_PASSWORD"])("leaves %s blank with a generation hint", (name) => {
    const index = lineIndex(name);
    expect(lines[index]).toBe(`${name}=`);
    expect(lines[index - 1]).toMatch(/^# Generate one: openssl rand /);
  });

  it("keeps 14 days of backups by default", () => {
    expect(lines[lineIndex("BACKUP_RETENTION_DAYS")]).toBe("BACKUP_RETENTION_DAYS=14");
  });
});
