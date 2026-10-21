// Server-only: never import from client components.

export type AppEnv = "development" | "test" | "production";

export type Config = {
  appEnv: AppEnv;
  isProduction: boolean;
  baseDomain: string;
  databaseUrl: string;
  testDatabaseUrl: string;
  reservedSlugs: readonly string[];
  devAliases: boolean;
  runMigrationsOnStart: boolean;
  seedOnStart: boolean;
  seedSuperadminEmail: string;
  authSecret: string;
  farmTestAuth: boolean;
  devInboxEnabled: boolean;
  notifyFake: boolean;
  publicUrlScheme: "http" | "https";
  publicUrlPort: string | null;
  storageDir: string;
  providers: {
    sms: "twilio" | "console";
    email: "brevo" | "console";
    cloudflare: boolean;
  };
  twilio: { accountSid: string; authToken: string; fromNumber: string } | null;
  brevo: { apiKey: string; senderEmail: string; senderName: string } | null;
  cloudflare: { apiToken: string; zoneId: string } | null;
};

export const RESERVED_SLUGS: readonly string[] = Object.freeze([
  "app",
  "admin",
  "www",
  "api",
  "static",
  "assets",
  "cdn",
  "mail",
  "email",
  "smtp",
  "help",
  "support",
  "status",
  "blog",
  "docs",
  "design",
  "dev",
  "_dev",
  "test",
  "staging",
  "demo-admin",
  "login",
  "auth",
  "billing",
  "drivebook",
]);

const RESERVED_SET = new Set(RESERVED_SLUGS);

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SET.has(slug.trim().toLowerCase());
}

const DEFAULT_BASE_DOMAIN = "drivebook.localhost";
const DEFAULT_DATABASE_URL = "postgres://drivebook:drivebook@localhost:5432/drivebook";
const DEFAULT_TEST_DATABASE_URL = "postgres://drivebook:drivebook@localhost:5432/drivebook_test";
const DEFAULT_SUPERADMIN_EMAIL = "admin@drivebook.localhost";
const DEFAULT_STORAGE_DIR = "./data/storage";
const DEFAULT_BREVO_SENDER_NAME = "DriveBook";
const DEV_AUTH_SECRET = "drivebook-dev-auth-secret-not-for-production";
const MIN_AUTH_SECRET_LENGTH = 32;

type Env = Record<string, string | undefined>;

function read(env: Env, name: string): string | undefined {
  const value = env[name]?.trim();
  return value ? value : undefined;
}

function readBool(env: Env, name: string, fallback: boolean): boolean {
  const value = read(env, name)?.toLowerCase();
  if (value === undefined) return fallback;
  if (["true", "1", "yes", "on"].includes(value)) return true;
  if (["false", "0", "no", "off"].includes(value)) return false;
  throw new Error(`Invalid boolean for ${name}: "${value}"`);
}

function readFlag(env: Env, name: string): boolean {
  return read(env, name) === "1";
}

function readScheme(env: Env): "http" | "https" {
  const value = read(env, "PUBLIC_URL_SCHEME")?.toLowerCase() ?? "https";
  if (value === "http" || value === "https") return value;
  throw new Error(`Invalid PUBLIC_URL_SCHEME: "${value}" (expected http or https)`);
}

function readPort(env: Env): string | null {
  const value = read(env, "PUBLIC_URL_PORT");
  if (value === undefined) return null;
  if (/^\d{1,5}$/.test(value)) return value;
  throw new Error(`Invalid PUBLIC_URL_PORT: "${value}"`);
}

function readAppEnv(env: Env): AppEnv {
  const value = read(env, "APP_ENV")?.toLowerCase();
  if (value === undefined) {
    return read(env, "NODE_ENV") === "production" ? "production" : "development";
  }
  if (value === "development" || value === "test" || value === "production") return value;
  throw new Error(`Invalid APP_ENV: "${value}" (expected development, test or production)`);
}

function normalizeDomain(raw: string): string {
  return raw.toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
}

function buildConfig(env: Env): Config {
  const appEnv = readAppEnv(env);
  const isProduction = appEnv === "production";

  const rawDatabaseUrl = read(env, "DATABASE_URL");
  const rawBaseDomain = read(env, "BASE_DOMAIN");
  const rawAuthSecret = read(env, "AUTH_SECRET");
  if (isProduction) {
    const missing = [
      rawDatabaseUrl ? null : "DATABASE_URL",
      rawBaseDomain ? null : "BASE_DOMAIN",
      rawAuthSecret ? null : "AUTH_SECRET",
    ].filter((name): name is string => name !== null);
    if (missing.length > 0) {
      throw new Error(`Missing required environment variables for production: ${missing.join(", ")}`);
    }
  }

  if (rawAuthSecret !== undefined && rawAuthSecret.length < MIN_AUTH_SECRET_LENGTH) {
    throw new Error(`AUTH_SECRET must be at least ${MIN_AUTH_SECRET_LENGTH} characters`);
  }

  const twilioSid = read(env, "TWILIO_ACCOUNT_SID");
  const twilioToken = read(env, "TWILIO_AUTH_TOKEN");
  const twilioFrom = read(env, "TWILIO_FROM_NUMBER");
  const twilio =
    twilioSid && twilioToken && twilioFrom
      ? { accountSid: twilioSid, authToken: twilioToken, fromNumber: twilioFrom }
      : null;

  const brevoKey = read(env, "BREVO_API_KEY");
  const brevoEmail = read(env, "BREVO_SENDER_EMAIL");
  const brevo =
    brevoKey && brevoEmail
      ? {
          apiKey: brevoKey,
          senderEmail: brevoEmail,
          senderName: read(env, "BREVO_SENDER_NAME") ?? DEFAULT_BREVO_SENDER_NAME,
        }
      : null;

  const cfToken = read(env, "CLOUDFLARE_API_TOKEN");
  const cfZone = read(env, "CLOUDFLARE_ZONE_ID");
  const cloudflare = cfToken && cfZone ? { apiToken: cfToken, zoneId: cfZone } : null;

  return {
    appEnv,
    isProduction,
    baseDomain: normalizeDomain(rawBaseDomain ?? DEFAULT_BASE_DOMAIN),
    databaseUrl: rawDatabaseUrl ?? DEFAULT_DATABASE_URL,
    testDatabaseUrl: read(env, "TEST_DATABASE_URL") ?? DEFAULT_TEST_DATABASE_URL,
    reservedSlugs: RESERVED_SLUGS,
    devAliases: !isProduction,
    runMigrationsOnStart: readBool(env, "RUN_MIGRATIONS_ON_START", true),
    seedOnStart: readBool(env, "SEED_ON_START", !isProduction),
    seedSuperadminEmail: read(env, "SEED_SUPERADMIN_EMAIL") ?? DEFAULT_SUPERADMIN_EMAIL,
    authSecret: rawAuthSecret ?? DEV_AUTH_SECRET,
    farmTestAuth: readFlag(env, "FARM_TEST_AUTH"),
    devInboxEnabled: !isProduction || readFlag(env, "DEV_INBOX_ENABLED"),
    notifyFake: readFlag(env, "NOTIFY_FAKE"),
    publicUrlScheme: readScheme(env),
    publicUrlPort: readPort(env),
    storageDir: read(env, "STORAGE_DIR") ?? DEFAULT_STORAGE_DIR,
    providers: {
      sms: twilio ? "twilio" : "console",
      email: brevo ? "brevo" : "console",
      cloudflare: cloudflare !== null,
    },
    twilio,
    brevo,
    cloudflare,
  };
}

let cached: Config | undefined;

export function getConfig(): Config {
  cached ??= Object.freeze(buildConfig(process.env));
  return cached;
}

export function surfaceOrigin(surface: "dealer" | "backoffice", config: Config = getConfig()): string {
  const host = `${surface === "dealer" ? "app" : "admin"}.${config.baseDomain}`;
  const port = config.publicUrlPort ? `:${config.publicUrlPort}` : "";
  return `${config.publicUrlScheme}://${host}${port}`;
}

export function dealerSiteOrigin(slug: string, config: Config = getConfig()): string {
  const port = config.publicUrlPort ? `:${config.publicUrlPort}` : "";
  return `${config.publicUrlScheme}://${slug}.${config.baseDomain}${port}`;
}

export function resetConfigForTests(): void {
  cached = undefined;
}
