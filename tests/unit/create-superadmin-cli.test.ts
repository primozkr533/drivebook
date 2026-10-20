// Real-database tests: start Postgres with `docker compose up -d db` (uses TEST_DATABASE_URL).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { authTokens, backofficeUsers, messageLog } from "@/db/schema";
import { resetConfigForTests } from "@/lib/config";
import { hashPassword } from "@/server/auth/password";
import { setDbForTests } from "@/server/data/db";
import { drainNotificationsForTest, stopBossForTests } from "@/server/notify/queue";
import { getTestDb, truncateAll } from "../setup/db";

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => {} }) }));

const { main, USAGE } = await import("@/server/auth/create-superadmin-cli");
const { inspectLinkToken } = await import("@/server/auth/links");

const db = getTestDb();
const previousAppEnv = process.env.APP_ENV;

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

beforeAll(() => {
  process.env.APP_ENV = "test";
  resetConfigForTests();
  setDbForTests(db);
});
beforeEach(async () => {
  await truncateAll();
  await drainNotificationsForTest();
  await truncateAll();
});
afterAll(async () => {
  await stopBossForTests();
  setDbForTests(undefined);
  if (previousAppEnv === undefined) delete process.env.APP_ENV;
  else process.env.APP_ENV = previousAppEnv;
  resetConfigForTests();
});

describe("create-superadmin CLI", () => {
  it("creates an invited superadmin, prints a set-password link and logs the invitation e-mail", async () => {
    const { code, link, err } = await run(["--email", "  Ops@DriveBook.si "]);
    expect(code).toBe(0);
    expect(err).toEqual([]);
    expect(link).toMatch(/^https?:\/\/admin\.[^/]+\/set-password\/[\w-]{20,}$/);

    const users = await db.select().from(backofficeUsers);
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({ email: "ops@drivebook.si", role: "superadmin", status: "invited" });

    const [log] = await db.select().from(messageLog);
    expect(log).toMatchObject({ channel: "email", template: "invitation", recipient: "ops@drivebook.si", status: "queued" });
    expect(await inspectLinkToken("backoffice", "invite", link!.split("/").pop()!)).toBe("valid");
  });

  it("reuses the user on a second run and invalidates the previous link", async () => {
    const first = await run(["--email", "ops@drivebook.si"]);
    const second = await run(["--email=OPS@drivebook.si"]);
    expect(second.code).toBe(0);
    expect(second.link).not.toBe(first.link);

    expect(await db.select().from(backofficeUsers)).toHaveLength(1);
    expect(await inspectLinkToken("backoffice", "invite", first.link!.split("/").pop()!)).toBe("used");
    expect(await inspectLinkToken("backoffice", "invite", second.link!.split("/").pop()!)).toBe("valid");
    expect(await db.select().from(messageLog)).toHaveLength(2);
  });

  it("issues a password-reset link for an already active user without changing their status", async () => {
    await db.insert(backofficeUsers).values({
      email: "ops@drivebook.si",
      name: "Ops",
      role: "support",
      status: "active",
      passwordHash: await hashPassword("staro-geslo-1234"),
    });
    const { code, link } = await run(["--email", "ops@drivebook.si"]);
    expect(code).toBe(0);
    expect(link).toMatch(/\/reset-password\//);

    const [user] = await db.select().from(backofficeUsers).where(eq(backofficeUsers.email, "ops@drivebook.si"));
    expect(user).toMatchObject({ role: "superadmin", status: "active" });
    const [token] = await db.select().from(authTokens);
    expect(token).toMatchObject({ surface: "backoffice", purpose: "reset", userId: user.id });
    const [log] = await db.select().from(messageLog);
    expect(log).toMatchObject({ template: "password_reset", recipient: "ops@drivebook.si" });
  });

  it.each([[[]], [["--email"]], [["--email", "not-an-email"]]])("exits 1 with usage for %j", async (argv) => {
    const { code, err, out } = await run(argv);
    expect(code).toBe(1);
    expect(err).toEqual([USAGE]);
    expect(out).toEqual([]);
    expect(await db.select().from(backofficeUsers)).toHaveLength(0);
  });

  it("is wired as an npm script", () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));
    expect(pkg.scripts["create-superadmin"]).toBe("tsx src/server/auth/create-superadmin-cli.ts");
  });
});
