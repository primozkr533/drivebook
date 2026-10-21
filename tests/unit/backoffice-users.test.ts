// Real-database tests: start Postgres with `docker compose up -d db` (uses TEST_DATABASE_URL).
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { auditLog, authTokens, backofficeSessions, backofficeUsers, messageLog } from "@/db/schema";
import { resetConfigForTests } from "@/lib/config";
import type { BackofficeSessionUser } from "@/server/auth/session";
import { getTestDb, truncateAll } from "../setup/db";

let current: BackofficeSessionUser | null = null;
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {} }),
  headers: async () => new Headers(),
}));
vi.mock("next/navigation", () => ({
  redirect: (location: string) => {
    throw new Error(`redirect ${location}`);
  },
}));
vi.mock("@/server/auth/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/auth/session")>();
  return {
    ...actual,
    getCurrentSession: async (surface: string) =>
      surface === "backoffice" && current ? { session: { id: "s" }, user: current } : null,
  };
});

const { ForbiddenError } = await import("@/server/auth/permissions");
const { createSession, validateSessionToken } = await import("@/server/auth/session");
const { inspectLinkToken } = await import("@/server/auth/links");
const { setDbForTests } = await import("@/server/data/db");
const { drainNotificationsForTest, stopBossForTests } = await import("@/server/notify/queue");
const { deactivateBackofficeUser, inviteBackofficeUser, listBackofficeUsers } = await import(
  "@/server/data/backoffice/users"
);

const db = getTestDb();
const previousAppEnv = process.env.APP_ENV;
const meta = { ip: "127.0.0.1", userAgent: "vitest" };

async function seed() {
  const [admin, support] = await db
    .insert(backofficeUsers)
    .values([
      { email: "admin@drivebook.si", name: "Admin", role: "superadmin", status: "active" },
      { email: "support@drivebook.si", name: "Support", role: "support", status: "active" },
    ])
    .returning();
  return { admin, support };
}

let s: Awaited<ReturnType<typeof seed>>;

const signInAs = (u: typeof s.admin) => {
  current = { id: u.id, email: u.email, name: u.name, role: u.role, status: u.status };
};

beforeAll(() => {
  process.env.APP_ENV = "test";
  resetConfigForTests();
  setDbForTests(db);
});
beforeEach(async () => {
  await truncateAll();
  await drainNotificationsForTest();
  await truncateAll();
  current = null;
  s = await seed();
});
afterAll(async () => {
  await stopBossForTests();
  setDbForTests(undefined);
  if (previousAppEnv === undefined) delete process.env.APP_ENV;
  else process.env.APP_ENV = previousAppEnv;
  resetConfigForTests();
});

describe("listBackofficeUsers", () => {
  it("lists users with role, status, created and last login for Support", async () => {
    const lastLoginAt = new Date("2026-10-01T08:00:00Z");
    await db.update(backofficeUsers).set({ lastLoginAt }).where(eq(backofficeUsers.id, s.admin.id));
    signInAs(s.support);

    const users = await listBackofficeUsers();
    expect(users.map((u) => u.email)).toEqual(["admin@drivebook.si", "support@drivebook.si"]);
    expect(users[0]).toMatchObject({ id: s.admin.id, role: "superadmin", status: "active", lastLoginAt });
    expect(users[0].createdAt).toBeInstanceOf(Date);
    expect(users[1].lastLoginAt).toBeNull();
  });
});

describe("inviteBackofficeUser", () => {
  it("creates an invited user, writes an audit row and queues the invitation e-mail", async () => {
    signInAs(s.admin);
    const result = await inviteBackofficeUser({ email: " Nova@DriveBook.si ", role: "support" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const [user] = await db.select().from(backofficeUsers).where(eq(backofficeUsers.id, result.userId));
    expect(user).toMatchObject({ email: "nova@drivebook.si", role: "support", status: "invited", passwordHash: null });

    const audits = await db.select().from(auditLog);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      actorKind: "backoffice_user",
      actorId: s.admin.id,
      action: "backoffice_user.invite",
      entity: "backoffice_user",
      entityId: result.userId,
    });

    expect(result.link).toMatch(/^https?:\/\/admin\.[^/]+\/set-password\//);
    expect(await inspectLinkToken("backoffice", "invite", result.link.split("/").pop()!)).toBe("valid");
    const logs = await db.select().from(messageLog);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ channel: "email", template: "invitation", recipient: "nova@drivebook.si" });
  });

  it("returns 'taken' for an existing e-mail without writing anything", async () => {
    signInAs(s.admin);
    expect(await inviteBackofficeUser({ email: "SUPPORT@drivebook.si", role: "superadmin" })).toEqual({
      ok: false,
      error: "taken",
    });
    expect(await db.select().from(backofficeUsers)).toHaveLength(2);
    expect(await db.select().from(auditLog)).toHaveLength(0);
    expect(await db.select().from(authTokens)).toHaveLength(0);
    expect(await db.select().from(messageLog)).toHaveLength(0);
  });

  it("throws ForbiddenError for Support", async () => {
    signInAs(s.support);
    await expect(inviteBackofficeUser({ email: "x@drivebook.si", role: "support" })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    expect(await db.select().from(backofficeUsers)).toHaveLength(2);
    expect(await db.select().from(messageLog)).toHaveLength(0);
  });
});

describe("deactivateBackofficeUser", () => {
  it("deactivates the user, deletes their sessions and writes an audit row", async () => {
    const token = await createSession("backoffice", s.support.id, meta);
    const adminToken = await createSession("backoffice", s.admin.id, meta);
    signInAs(s.admin);

    expect(await deactivateBackofficeUser(s.support.id)).toEqual({ ok: true });

    const [user] = await db.select().from(backofficeUsers).where(eq(backofficeUsers.id, s.support.id));
    expect(user.status).toBe("deactivated");
    expect(await db.select().from(backofficeSessions).where(eq(backofficeSessions.userId, s.support.id))).toHaveLength(0);
    expect(await validateSessionToken("backoffice", token)).toBeNull();
    expect(await validateSessionToken("backoffice", adminToken)).not.toBeNull();

    const audits = await db.select().from(auditLog);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      actorId: s.admin.id,
      action: "backoffice_user.deactivate",
      entity: "backoffice_user",
      entityId: s.support.id,
    });
  });

  it("returns 'self' when a Superadmin deactivates themselves", async () => {
    signInAs(s.admin);
    expect(await deactivateBackofficeUser(s.admin.id)).toEqual({ ok: false, error: "self" });
    const [user] = await db.select().from(backofficeUsers).where(eq(backofficeUsers.id, s.admin.id));
    expect(user.status).toBe("active");
    expect(await db.select().from(auditLog)).toHaveLength(0);
  });

  it("returns 'not_found' for an unknown id without an audit row", async () => {
    signInAs(s.admin);
    expect(await deactivateBackofficeUser("00000000-0000-4000-8000-000000000000")).toEqual({
      ok: false,
      error: "not_found",
    });
    expect(await deactivateBackofficeUser("not-a-uuid")).toEqual({ ok: false, error: "not_found" });
    expect(await db.select().from(auditLog)).toHaveLength(0);
  });

  it("throws ForbiddenError for Support", async () => {
    signInAs(s.support);
    await expect(deactivateBackofficeUser(s.admin.id)).rejects.toBeInstanceOf(ForbiddenError);
    const [user] = await db.select().from(backofficeUsers).where(eq(backofficeUsers.id, s.admin.id));
    expect(user.status).toBe("active");
  });
});
