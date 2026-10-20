// Real-database tests: start Postgres with `docker compose up -d db` (uses TEST_DATABASE_URL).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { authTokens, backofficeUsers, dealers, dealerSessions, dealerUsers, messageLog, plans } from "@/db/schema";
import { resetConfigForTests } from "@/lib/config";
import { hashPassword } from "@/server/auth/password";
import { setDbForTests } from "@/server/data/db";
import { drainNotificationsForTest, stopBossForTests } from "@/server/notify/queue";
import { getTestDb, truncateAll } from "../setup/db";

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => {} }) }));

const { main, USAGE } = await import("@/server/auth/user-admin-cli");
const { inspectLinkToken } = await import("@/server/auth/links");
const { login } = await import("@/server/auth/login");
const { createSession, validateSessionToken } = await import("@/server/auth/session");

const db = getTestDb();
const previousAppEnv = process.env.APP_ENV;
const PASSWORD = "staro-geslo-1234";
const meta = { ip: "127.0.0.1", userAgent: "vitest" };

function captureIo() {
  const out: string[] = [];
  const err: string[] = [];
  return { out, err, io: { log: (line: string) => out.push(line), error: (line: string) => err.push(line) } };
}

async function run(argv: string[]) {
  const { out, err, io } = captureIo();
  const code = await main(argv, io);
  const link = out.join("\n").match(/^Set-password link: (\S+)$/m)?.[1];
  return { code, out, err, link };
}

async function seed() {
  const [plan] = await db
    .insert(plans)
    .values({ code: "basic", name: "Basic", maxCars: 20, maxUsers: 5, smsIncluded: 100, priceEurCents: 4900 })
    .returning();
  const [dealer] = await db
    .insert(dealers)
    .values({
      slug: "demo",
      name: "Avtohiša Demo",
      legalName: "Demo d.o.o.",
      addressLine: "Dunajska cesta 1",
      postalCode: "1000",
      city: "Ljubljana",
      phone: "+38611234567",
      email: "info@demo.si",
      primaryColor: "#E4572E",
      planId: plan.id,
    })
    .returning();
  const passwordHash = await hashPassword(PASSWORD);
  const [owner, invited] = await db
    .insert(dealerUsers)
    .values([
      { dealerId: dealer.id, email: "owner@demo.si", name: "Owner", role: "owner", status: "active", passwordHash },
      { dealerId: dealer.id, email: "prodajalec@demo.si", name: "Prodajalec", role: "salesperson" },
    ])
    .returning();
  const [admin] = await db
    .insert(backofficeUsers)
    .values({ email: "admin@drivebook.si", name: "Admin", role: "support" })
    .returning();
  return { owner, invited, admin };
}

let s: Awaited<ReturnType<typeof seed>>;

beforeAll(() => {
  process.env.APP_ENV = "test";
  resetConfigForTests();
  setDbForTests(db);
});
beforeEach(async () => {
  await truncateAll();
  await drainNotificationsForTest();
  await truncateAll();
  s = await seed();
});
afterAll(async () => {
  await stopBossForTests();
  setDbForTests(undefined);
  if (previousAppEnv === undefined) delete process.env.APP_ENV;
  else process.env.APP_ENV = previousAppEnv;
  resetConfigForTests();
});

describe("user-admin CLI: deactivate", () => {
  it("deactivates the user, revokes all sessions and blocks future logins", async () => {
    const a = await createSession("dealer", s.owner.id, meta);
    const b = await createSession("dealer", s.owner.id, meta);

    const { code, out, err } = await run(["deactivate", "--surface", "dealer", "--email", " Owner@Demo.si "]);
    expect(code).toBe(0);
    expect(err).toEqual([]);
    expect(out.join("\n")).toContain("owner@demo.si");

    const [user] = await db.select().from(dealerUsers).where(eq(dealerUsers.id, s.owner.id));
    expect(user.status).toBe("deactivated");
    expect(await db.select().from(dealerSessions)).toHaveLength(0);
    expect(await validateSessionToken("dealer", a)).toBeNull();
    expect(await validateSessionToken("dealer", b)).toBeNull();
    expect(await login({ ...meta, surface: "dealer", email: "owner@demo.si", password: PASSWORD })).toEqual({
      ok: false,
      error: "invalid",
    });
  });

  it("deactivates a backoffice user with --flag=value syntax", async () => {
    const { code } = await run(["deactivate", "--surface=backoffice", "--email=admin@drivebook.si"]);
    expect(code).toBe(0);
    const [admin] = await db.select().from(backofficeUsers).where(eq(backofficeUsers.id, s.admin.id));
    expect(admin.status).toBe("deactivated");
  });

  it("exits 1 for an unknown e-mail and keeps the surfaces separate", async () => {
    const { code, err, out } = await run(["deactivate", "--surface", "backoffice", "--email", "owner@demo.si"]);
    expect(code).toBe(1);
    expect(out).toEqual([]);
    expect(err).toEqual(["No backoffice user with e-mail owner@demo.si"]);
    const [owner] = await db.select().from(dealerUsers).where(eq(dealerUsers.id, s.owner.id));
    expect(owner.status).toBe("active");
  });
});

describe("user-admin CLI: resend-invite", () => {
  it("prints a fresh invitation link, invalidates the previous one and queues the e-mail", async () => {
    const first = await run(["resend-invite", "--surface", "dealer", "--email", "prodajalec@demo.si"]);
    const second = await run(["resend-invite", "--surface", "dealer", "--email", "prodajalec@demo.si"]);
    expect(second.code).toBe(0);
    expect(second.err).toEqual([]);
    expect(second.link).toMatch(/^https?:\/\/app\.[^/]+\/set-password\/[\w-]{20,}$/);
    expect(second.link).not.toBe(first.link);

    expect(await inspectLinkToken("dealer", "invite", first.link!.split("/").pop()!)).toBe("used");
    expect(await inspectLinkToken("dealer", "invite", second.link!.split("/").pop()!)).toBe("valid");
    const logs = await db.select().from(messageLog);
    expect(logs).toHaveLength(2);
    for (const log of logs) expect(log).toMatchObject({ channel: "email", template: "invitation", recipient: "prodajalec@demo.si" });
  });

  it("works for an invited backoffice user", async () => {
    const { code, link } = await run(["resend-invite", "--surface", "backoffice", "--email", "admin@drivebook.si"]);
    expect(code).toBe(0);
    expect(link).toMatch(/^https?:\/\/admin\.[^/]+\/set-password\//);
    const [token] = await db.select().from(authTokens);
    expect(token).toMatchObject({ surface: "backoffice", purpose: "invite", userId: s.admin.id });
  });

  it("exits 1 for an already active user without issuing a link", async () => {
    const { code, err, out } = await run(["resend-invite", "--surface", "dealer", "--email", "owner@demo.si"]);
    expect(code).toBe(1);
    expect(out).toEqual([]);
    expect(err[0]).toMatch(/not in the invited state/);
    expect(await db.select().from(authTokens)).toHaveLength(0);
    expect(await db.select().from(messageLog)).toHaveLength(0);
  });

  it("exits 1 for an unknown e-mail", async () => {
    const { code, err } = await run(["resend-invite", "--surface", "dealer", "--email", "nobody@demo.si"]);
    expect(code).toBe(1);
    expect(err).toEqual(["No dealer user with e-mail nobody@demo.si"]);
  });
});

describe("user-admin CLI: arguments", () => {
  it.each([
    [[]],
    [["deactivate"]],
    [["delete", "--surface", "dealer", "--email", "owner@demo.si"]],
    [["deactivate", "--surface", "dealer"]],
    [["deactivate", "--email", "owner@demo.si"]],
    [["deactivate", "--surface", "public", "--email", "owner@demo.si"]],
    [["deactivate", "--surface", "dealer", "--email", "not-an-email"]],
    [["deactivate", "--surface", "dealer", "--email", "owner@demo.si", "--force"]],
  ])("exits 1 with usage for %j", async (argv) => {
    const { code, err, out } = await run(argv);
    expect(code).toBe(1);
    expect(err).toEqual([USAGE]);
    expect(out).toEqual([]);
    const [owner] = await db.select().from(dealerUsers).where(eq(dealerUsers.id, s.owner.id));
    expect(owner.status).toBe("active");
  });

  it("is wired as an npm script", () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));
    expect(pkg.scripts["user-admin"]).toBe("tsx src/server/auth/user-admin-cli.ts");
  });
});
