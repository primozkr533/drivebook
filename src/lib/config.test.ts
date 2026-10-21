import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { dealerSiteOrigin, getConfig, isReservedSlug, resetConfigForTests, surfaceOrigin } from "@/lib/config";

const originalEnv = process.env;
const SECRET = "x".repeat(32);

function setEnv(env: Record<string, string>) {
  process.env = { ...env } as NodeJS.ProcessEnv;
  resetConfigForTests();
}

beforeEach(() => setEnv({}));

afterEach(() => {
  process.env = originalEnv;
  resetConfigForTests();
});

describe("getConfig", () => {
  it("uses development defaults with an empty env", () => {
    const config = getConfig();
    expect(config.appEnv).toBe("development");
    expect(config.isProduction).toBe(false);
    expect(config.baseDomain).toBe("drivebook.localhost");
    expect(config.databaseUrl).toBe("postgres://drivebook:drivebook@localhost:5432/drivebook");
    expect(config.testDatabaseUrl).toBe("postgres://drivebook:drivebook@localhost:5432/drivebook_test");
    expect(config.devAliases).toBe(true);
    expect(config.runMigrationsOnStart).toBe(true);
    expect(config.seedOnStart).toBe(true);
    expect(config.seedSuperadminEmail).toBe("admin@drivebook.localhost");
    expect(config.providers).toEqual({ sms: "console", email: "console", cloudflare: false });
    expect(config.twilio).toBeNull();
    expect(config.brevo).toBeNull();
    expect(config.cloudflare).toBeNull();
    expect(config.authSecret.length).toBeGreaterThanOrEqual(32);
    expect(config.farmTestAuth).toBe(false);
    expect(config.devInboxEnabled).toBe(true);
    expect(config.notifyFake).toBe(false);
    expect(config.publicUrlScheme).toBe("https");
    expect(config.publicUrlPort).toBeNull();
  });

  it("is memoised until reset", () => {
    const first = getConfig();
    process.env.BASE_DOMAIN = "other.test";
    expect(getConfig()).toBe(first);
    resetConfigForTests();
    expect(getConfig().baseDomain).toBe("other.test");
  });

  it("defaults appEnv to production when NODE_ENV=production", () => {
    setEnv({ NODE_ENV: "production", DATABASE_URL: "postgres://x", BASE_DOMAIN: "drivebook.si", AUTH_SECRET: SECRET });
    const config = getConfig();
    expect(config.appEnv).toBe("production");
    expect(config.devAliases).toBe(false);
    expect(config.seedOnStart).toBe(false);
  });

  it("lets APP_ENV override NODE_ENV", () => {
    setEnv({ NODE_ENV: "production", APP_ENV: "development" });
    expect(getConfig().appEnv).toBe("development");
  });

  it("throws naming every missing variable in production", () => {
    setEnv({ APP_ENV: "production" });
    expect(() => getConfig()).toThrow(/DATABASE_URL/);
    expect(() => getConfig()).toThrow(/BASE_DOMAIN/);
  });

  it("throws in production when AUTH_SECRET is missing", () => {
    setEnv({ APP_ENV: "production", DATABASE_URL: "postgres://x", BASE_DOMAIN: "drivebook.si" });
    expect(() => getConfig()).toThrow(/AUTH_SECRET/);
  });

  it("throws in production when AUTH_SECRET is shorter than 32 chars", () => {
    setEnv({ APP_ENV: "production", DATABASE_URL: "postgres://x", BASE_DOMAIN: "drivebook.si", AUTH_SECRET: "x".repeat(31) });
    expect(() => getConfig()).toThrow(/AUTH_SECRET/);
  });

  it("passes a valid AUTH_SECRET through in production", () => {
    setEnv({ APP_ENV: "production", DATABASE_URL: "postgres://x", BASE_DOMAIN: "drivebook.si", AUTH_SECRET: SECRET });
    expect(getConfig().authSecret).toBe(SECRET);
  });

  it("treats auth/notify flags as true only for the literal 1", () => {
    setEnv({ FARM_TEST_AUTH: "1", NOTIFY_FAKE: "1" });
    expect(getConfig().farmTestAuth).toBe(true);
    expect(getConfig().notifyFake).toBe(true);
    setEnv({ FARM_TEST_AUTH: "true", NOTIFY_FAKE: "yes" });
    expect(getConfig().farmTestAuth).toBe(false);
    expect(getConfig().notifyFake).toBe(false);
  });

  it("serves the dev inbox in production only when DEV_INBOX_ENABLED=1", () => {
    const prod = { APP_ENV: "production", DATABASE_URL: "postgres://x", BASE_DOMAIN: "drivebook.si", AUTH_SECRET: SECRET };
    setEnv(prod);
    expect(getConfig().devInboxEnabled).toBe(false);
    setEnv({ ...prod, DEV_INBOX_ENABLED: "1" });
    expect(getConfig().devInboxEnabled).toBe(true);
  });

  it("reads the public URL scheme and port", () => {
    setEnv({ PUBLIC_URL_SCHEME: "http", PUBLIC_URL_PORT: "3000" });
    expect(getConfig().publicUrlScheme).toBe("http");
    expect(getConfig().publicUrlPort).toBe("3000");
  });

  it("reads STORAGE_DIR and defaults to ./data/storage", () => {
    expect(getConfig().storageDir).toBe("./data/storage");
    const composeDir = ["", "data", "storage"].join("/");
    setEnv({ STORAGE_DIR: composeDir });
    expect(getConfig().storageDir).toBe(composeDir);
  });

  it("rejects an invalid public URL scheme", () => {
    setEnv({ PUBLIC_URL_SCHEME: "ftp" });
    expect(() => getConfig()).toThrow(/PUBLIC_URL_SCHEME/);
  });

  it("treats whitespace-only values as missing", () => {
    setEnv({ APP_ENV: "production", DATABASE_URL: "  ", BASE_DOMAIN: "drivebook.si" });
    expect(() => getConfig()).toThrow(/DATABASE_URL/);
  });

  it("does not throw on import", async () => {
    setEnv({ APP_ENV: "production" });
    await expect(import("@/lib/config")).resolves.toBeDefined();
  });

  it("lowercases the base domain and strips the port", () => {
    setEnv({ BASE_DOMAIN: " DriveBook.SI:3000 " });
    expect(getConfig().baseDomain).toBe("drivebook.si");
  });

  it("parses boolean flags", () => {
    setEnv({ RUN_MIGRATIONS_ON_START: "false", SEED_ON_START: "0" });
    const config = getConfig();
    expect(config.runMigrationsOnStart).toBe(false);
    expect(config.seedOnStart).toBe(false);
  });

  it("selects twilio when all three vars are set", () => {
    setEnv({ TWILIO_ACCOUNT_SID: "AC123", TWILIO_AUTH_TOKEN: "tok", TWILIO_FROM_NUMBER: "+38640000000" });
    const config = getConfig();
    expect(config.providers.sms).toBe("twilio");
    expect(config.twilio).toEqual({ accountSid: "AC123", authToken: "tok", fromNumber: "+38640000000" });
  });

  it("falls back to console sms when a twilio var is missing", () => {
    setEnv({ TWILIO_ACCOUNT_SID: "AC123", TWILIO_AUTH_TOKEN: "tok", TWILIO_FROM_NUMBER: " " });
    expect(getConfig().providers.sms).toBe("console");
    expect(getConfig().twilio).toBeNull();
  });

  it("selects brevo when key and sender email are set", () => {
    setEnv({ BREVO_API_KEY: "key", BREVO_SENDER_EMAIL: "noreply@drivebook.si" });
    const config = getConfig();
    expect(config.providers.email).toBe("brevo");
    expect(config.brevo).toEqual({ apiKey: "key", senderEmail: "noreply@drivebook.si", senderName: "DriveBook" });
  });

  it("passes a custom brevo sender name through", () => {
    setEnv({ BREVO_API_KEY: "key", BREVO_SENDER_EMAIL: "a@b.si", BREVO_SENDER_NAME: "Avto Hiša" });
    expect(getConfig().brevo?.senderName).toBe("Avto Hiša");
  });

  it("enables cloudflare when token and zone are set", () => {
    setEnv({ CLOUDFLARE_API_TOKEN: "cf-token", CLOUDFLARE_ZONE_ID: "zone" });
    const config = getConfig();
    expect(config.providers.cloudflare).toBe(true);
    expect(config.cloudflare).toEqual({ apiToken: "cf-token", zoneId: "zone" });
  });

  it("never throws for missing provider keys in production", () => {
    setEnv({ APP_ENV: "production", DATABASE_URL: "postgres://x", BASE_DOMAIN: "drivebook.si", AUTH_SECRET: SECRET });
    expect(getConfig().providers).toEqual({ sms: "console", email: "console", cloudflare: false });
  });
});

describe("surfaceOrigin", () => {
  it("builds dev origins with scheme and port", () => {
    setEnv({ PUBLIC_URL_SCHEME: "http", PUBLIC_URL_PORT: "3000", BASE_DOMAIN: "drivebook.localhost" });
    expect(surfaceOrigin("dealer")).toBe("http://app.drivebook.localhost:3000");
    expect(surfaceOrigin("backoffice")).toBe("http://admin.drivebook.localhost:3000");
  });

  it("omits an empty port in production", () => {
    setEnv({ PUBLIC_URL_SCHEME: "https", PUBLIC_URL_PORT: "", BASE_DOMAIN: "drivebook.si" });
    expect(surfaceOrigin("dealer")).toBe("https://app.drivebook.si");
    expect(surfaceOrigin("backoffice")).toBe("https://admin.drivebook.si");
  });
});

describe("dealerSiteOrigin", () => {
  it("builds the dealer subdomain origin", () => {
    setEnv({ PUBLIC_URL_SCHEME: "http", PUBLIC_URL_PORT: "3000", BASE_DOMAIN: "drivebook.localhost" });
    expect(dealerSiteOrigin("novak")).toBe("http://novak.drivebook.localhost:3000");
    setEnv({ PUBLIC_URL_SCHEME: "https", PUBLIC_URL_PORT: "", BASE_DOMAIN: "drivebook.si" });
    expect(dealerSiteOrigin("novak")).toBe("https://novak.drivebook.si");
  });
});

describe("isReservedSlug", () => {
  it("matches case-insensitively", () => {
    expect(isReservedSlug("APP")).toBe(true);
    expect(isReservedSlug("www")).toBe(true);
    expect(isReservedSlug("admin")).toBe(true);
    expect(isReservedSlug("demo")).toBe(false);
  });
});
