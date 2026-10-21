// Real-database tests: start Postgres with `docker compose up -d db` (uses TEST_DATABASE_URL).
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { auditLog, dealerSessions } from "@/db/schema";
import { DEMO_DEALER_SLUG, DEMO_OWNER_EMAIL, runSeed } from "@/db/seed";
import { resetConfigForTests } from "@/lib/config";
import { setDbForTests } from "@/server/data/db";
import { getTestDb, truncateAll } from "../setup/db";

const jar = new Map<string, { value: string; options?: unknown }>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)!.value } : undefined),
    set: (name: string, value: string, options?: unknown) => void jar.set(name, { value, options }),
  }),
}));

const { POST } = await import("@/app/api/test/login/route");
const { SESSION_COOKIE, SESSION_COOKIE_OPTIONS, validateSessionToken } = await import("@/server/auth/session");
const { TEST_LOGIN_PATH } = await import("@/server/routing");

const db = getTestDb();

const post = (host: string, body?: string) =>
  POST(
    new Request(`http://${host}${TEST_LOGIN_PATH}`, {
      method: "POST",
      headers: { host, "x-forwarded-for": "203.0.113.9", "user-agent": "vitest" },
      body,
    }),
  );

beforeAll(async () => {
  setDbForTests(db);
  await truncateAll();
  await runSeed(db);
});

beforeEach(() => jar.clear());

afterEach(() => {
  delete process.env.FARM_TEST_AUTH;
  resetConfigForTests();
});

afterAll(async () => {
  setDbForTests(undefined);
  await truncateAll();
  await db.$client.end();
});

const enable = () => {
  process.env.FARM_TEST_AUTH = "1";
  resetConfigForTests();
};

describe("POST /api/test/login", () => {
  it("404s without FARM_TEST_AUTH and sets no cookie", async () => {
    resetConfigForTests();
    const res = await post("localhost:3000");
    expect(res.status).toBe(404);
    expect(jar.size).toBe(0);
  });

  it("signs in the demo Owner and sets db_app_session", async () => {
    enable();
    const res = await post("localhost:3000");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      user: { email: DEMO_OWNER_EMAIL, role: "owner" },
      dealerSlug: DEMO_DEALER_SLUG,
      redirect: "/_dev/app",
    });

    const cookie = jar.get(SESSION_COOKIE.dealer);
    expect(cookie?.options).toEqual(SESSION_COOKIE_OPTIONS);
    expect(jar.has(SESSION_COOKIE.backoffice)).toBe(false);
    const session = await validateSessionToken("dealer", cookie!.value);
    expect(session?.user).toMatchObject({ email: DEMO_OWNER_EMAIL, role: "owner" });
    expect(await validateSessionToken("backoffice", cookie!.value)).toBeNull();
    expect(session?.session).toMatchObject({ ip: "203.0.113.9", userAgent: "vitest" });
  });

  it("returns / as the redirect on app. and accepts { surface: 'dealer' }", async () => {
    enable();
    const res = await post("app.drivebook.localhost:3000", JSON.stringify({ surface: "dealer" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, redirect: "/" });
  });

  it("drops Secure on a plain-http non-localhost dev host such as the farm's web:3000", async () => {
    enable();
    const res = await post("web:3000");
    expect(await res.json()).toMatchObject({ ok: true, redirect: "/_dev/app" });
    expect(jar.get(SESSION_COOKIE.dealer)?.options).toEqual({ ...SESSION_COOKIE_OPTIONS, secure: false });
  });

  it("rejects other surfaces", async () => {
    enable();
    for (const body of [JSON.stringify({ surface: "backoffice" }), "not json", "[1]"]) {
      expect((await post("localhost:3000", body)).status).toBe(400);
    }
    expect(jar.size).toBe(0);
  });

  it("404s on dealer and admin. hosts", async () => {
    enable();
    expect((await post("demo.drivebook.localhost")).status).toBe(404);
    expect((await post("admin.drivebook.localhost")).status).toBe(404);
    expect(jar.size).toBe(0);
  });

  it("writes auth.login.success with reason test_login", async () => {
    enable();
    await db.delete(auditLog);
    await post("localhost:3000");
    const rows = await db.select().from(auditLog).where(eq(auditLog.action, "auth.login.success"));
    expect(rows).toHaveLength(1);
    expect(rows[0].data).toMatchObject({ surface: "dealer", email: DEMO_OWNER_EMAIL, reason: "test_login" });
    expect(rows[0].dealerId).not.toBeNull();
    expect(await db.select().from(dealerSessions).where(eq(dealerSessions.userId, rows[0].actorId!))).not.toHaveLength(0);
  });
});
