// Real-database tests: start Postgres with `docker compose up -d db` (uses TEST_DATABASE_URL).
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  auditLog,
  authTokens,
  backofficeUsers,
  dealers,
  dealerSessions,
  dealerUsers,
  devOutbox,
  messageLog,
  plans,
} from "@/db/schema";
import { resetConfigForTests } from "@/lib/config";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { setDbForTests } from "@/server/data/db";
import { drainNotificationsForTest, stopBossForTests } from "@/server/notify/queue";
import { getTestDb, truncateAll } from "../setup/db";

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => {} }) }));

const { createSession, validateSessionToken } = await import("@/server/auth/session");
const {
  consumeLinkToken,
  createInvitation,
  INVITE_TTL_MS,
  inspectLinkToken,
  requestPasswordReset,
  resendInvitation,
  RESET_TTL_MS,
} = await import("@/server/auth/links");

const db = getTestDb();
const previousAppEnv = process.env.APP_ENV;
const NEW_PASSWORD = "nov-geslo-1234";
const meta = { ip: "127.0.0.1", userAgent: "vitest" };

async function seedUsers() {
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
  const [invited] = await db
    .insert(dealerUsers)
    .values({ dealerId: dealer.id, email: "prodajalec@demo.si", name: "Prodajalec", role: "salesperson" })
    .returning();
  const [active] = await db
    .insert(dealerUsers)
    .values({
      dealerId: dealer.id,
      email: "owner@demo.si",
      name: "Owner",
      role: "owner",
      status: "active",
      passwordHash: await hashPassword("staro-geslo-1234"),
    })
    .returning();
  const [admin] = await db
    .insert(backofficeUsers)
    .values({ email: "admin@drivebook.si", name: "Admin", role: "superadmin" })
    .returning();
  return { dealer, invited, active, admin };
}

let seeded: Awaited<ReturnType<typeof seedUsers>>;

function tokenOf(link: string): string {
  return link.split("/").pop()!;
}

async function outboxResetLink(): Promise<string> {
  await drainNotificationsForTest();
  const [mail] = await db.select().from(devOutbox);
  return mail.textBody.match(/https?:\/\/\S+\/reset-password\/[\w-]+/)![0];
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
  seeded = await seedUsers();
});
afterAll(async () => {
  await stopBossForTests();
  setDbForTests(undefined);
  if (previousAppEnv === undefined) delete process.env.APP_ENV;
  else process.env.APP_ENV = previousAppEnv;
  resetConfigForTests();
});

describe("createInvitation", () => {
  it("sends a dealer-branded e-mail with a /set-password/ link and logs it", async () => {
    const { link } = await createInvitation("dealer", seeded.invited.id);
    expect(link).toMatch(/^https?:\/\/app\.[^/]+\/set-password\/[\w-]{20,}$/);

    expect(await drainNotificationsForTest()).toBe(1);
    const outbox = await db.select().from(devOutbox);
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({ channel: "email", recipient: "prodajalec@demo.si", sender: "Avtohiša Demo" });
    expect(outbox[0].textBody).toContain(link);
    expect(outbox[0].textBody).toContain("/set-password/");

    const [log] = await db.select().from(messageLog);
    expect(log).toMatchObject({
      channel: "email",
      template: "invitation",
      recipient: "prodajalec@demo.si",
      status: "sent",
      dealerId: seeded.dealer.id,
    });
  });

  it("stores only the token hash and uses DriveBook as sender for backoffice", async () => {
    const { link } = await createInvitation("backoffice", seeded.admin.id);
    expect(link).toMatch(/^https?:\/\/admin\.[^/]+\/set-password\//);
    const [row] = await db.select().from(authTokens);
    expect(row.tokenHash).not.toBe(tokenOf(link));
    expect(row.tokenHash).toMatch(/^[0-9a-f]{64}$/);

    await drainNotificationsForTest();
    const [mail] = await db.select().from(devOutbox);
    expect(mail.sender).toBe("DriveBook");
  });
});

describe("invite lifecycle", () => {
  it("is valid until 7 days pass, then expired", async () => {
    const now = new Date();
    const { link } = await createInvitation("dealer", seeded.invited.id, { now });
    const token = tokenOf(link);
    expect(await inspectLinkToken("dealer", "invite", token, { now })).toBe("valid");
    const almost = new Date(now.getTime() + INVITE_TTL_MS - 1000);
    expect(await inspectLinkToken("dealer", "invite", token, { now: almost })).toBe("valid");
    const after = new Date(now.getTime() + INVITE_TTL_MS + 1000);
    expect(await inspectLinkToken("dealer", "invite", token, { now: after })).toBe("expired");
    expect(await consumeLinkToken("dealer", "invite", token, NEW_PASSWORD, { ...meta, now: after })).toEqual({
      ok: false,
      error: "expired",
    });
  });

  it("rejects garbage, wrong-purpose and wrong-surface tokens as invalid", async () => {
    const { link } = await createInvitation("dealer", seeded.invited.id);
    expect(await inspectLinkToken("dealer", "invite", "garbage")).toBe("invalid");
    expect(await inspectLinkToken("dealer", "reset", tokenOf(link))).toBe("invalid");
    expect(await inspectLinkToken("backoffice", "invite", tokenOf(link))).toBe("invalid");
    expect(await consumeLinkToken("dealer", "invite", "garbage", NEW_PASSWORD, meta)).toEqual({
      ok: false,
      error: "invalid",
    });
  });

  it("accepting sets the password, activates the user and logs them in; a second use is rejected", async () => {
    const { link } = await createInvitation("dealer", seeded.invited.id);
    const token = tokenOf(link);

    expect(await consumeLinkToken("dealer", "invite", token, "short", meta)).toEqual({ ok: false, error: "too_short" });
    expect(await inspectLinkToken("dealer", "invite", token)).toBe("valid");

    const result = await consumeLinkToken("dealer", "invite", token, NEW_PASSWORD, meta);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const [user] = await db.select().from(dealerUsers).where(eq(dealerUsers.id, seeded.invited.id));
    expect(user.status).toBe("active");
    expect(await verifyPassword(user.passwordHash!, NEW_PASSWORD)).toBe(true);

    const session = await validateSessionToken("dealer", result.sessionToken);
    expect(session?.user.id).toBe(seeded.invited.id);

    const audit = await db.select().from(auditLog).where(eq(auditLog.action, "auth.invite.accepted"));
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actorId: seeded.invited.id, dealerId: seeded.dealer.id });

    expect(await inspectLinkToken("dealer", "invite", token)).toBe("used");
    expect(await consumeLinkToken("dealer", "invite", token, NEW_PASSWORD, meta)).toEqual({ ok: false, error: "used" });
  });

  it("resending invalidates the earlier link", async () => {
    const first = await createInvitation("dealer", seeded.invited.id);
    const second = await resendInvitation("dealer", seeded.invited.id);
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    expect(await inspectLinkToken("dealer", "invite", tokenOf(first.link))).toBe("used");
    expect(await inspectLinkToken("dealer", "invite", tokenOf(second.link))).toBe("valid");
    expect(await drainNotificationsForTest()).toBe(2);
  });

  it("refuses to resend once the user is active", async () => {
    expect(await resendInvitation("dealer", seeded.active.id)).toEqual({ ok: false, error: "already_active" });
    expect(await db.select().from(authTokens)).toHaveLength(0);
    expect(await db.select().from(messageLog)).toHaveLength(0);
  });
});

describe("requestPasswordReset", () => {
  it("resolves identically for an unknown email and sends nothing", async () => {
    const unknown = await requestPasswordReset("dealer", "nobody@demo.si");
    const notActive = await requestPasswordReset("dealer", seeded.invited.email);
    expect(await drainNotificationsForTest()).toBe(0);
    expect(await db.select().from(devOutbox)).toHaveLength(0);
    expect(await db.select().from(messageLog)).toHaveLength(0);
    expect(await db.select().from(authTokens)).toHaveLength(0);

    const known = await requestPasswordReset("dealer", "OWNER@demo.si ");
    expect(unknown).toEqual(known);
    expect(notActive).toEqual(known);
  });

  it("sends one e-mail with a /reset-password/ link to an active user", async () => {
    await requestPasswordReset("dealer", "owner@demo.si");
    expect(await drainNotificationsForTest()).toBe(1);
    const outbox = await db.select().from(devOutbox);
    expect(outbox).toHaveLength(1);
    expect(outbox[0].recipient).toBe("owner@demo.si");
    expect(outbox[0].textBody).toContain("/reset-password/");
    const [log] = await db.select().from(messageLog);
    expect(log).toMatchObject({ template: "password_reset", status: "sent" });
  });

  it("expires a reset link after 1 hour and invalidates older reset links", async () => {
    const now = new Date();
    await requestPasswordReset("dealer", "owner@demo.si", { now });
    const first = tokenOf(await outboxResetLink());
    expect(await inspectLinkToken("dealer", "reset", first, { now })).toBe("valid");
    const later = new Date(now.getTime() + RESET_TTL_MS + 1000);
    expect(await inspectLinkToken("dealer", "reset", first, { now: later })).toBe("expired");

    await requestPasswordReset("dealer", "owner@demo.si", { now });
    expect(await inspectLinkToken("dealer", "reset", first, { now })).toBe("used");
  });

  it("sends at most 3 reset e-mails per email per hour", async () => {
    const now = new Date();
    for (let i = 0; i < 5; i++) await requestPasswordReset("dealer", "owner@demo.si", { now });
    expect(await db.select().from(authTokens)).toHaveLength(3);
    expect(await drainNotificationsForTest()).toBe(3);

    const nextHour = new Date(now.getTime() + 61 * 60 * 1000);
    await requestPasswordReset("dealer", "owner@demo.si", { now: nextHour });
    expect(await db.select().from(authTokens)).toHaveLength(4);
  });

  it("resetting the password revokes prior sessions and logs the user in", async () => {
    const before = await createSession("dealer", seeded.active.id, meta);
    expect(await validateSessionToken("dealer", before)).not.toBeNull();

    await requestPasswordReset("dealer", "owner@demo.si");
    const token = tokenOf(await outboxResetLink());
    const result = await consumeLinkToken("dealer", "reset", token, NEW_PASSWORD, meta);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(await validateSessionToken("dealer", before)).toBeNull();
    expect((await validateSessionToken("dealer", result.sessionToken))?.user.id).toBe(seeded.active.id);
    expect(await db.select().from(dealerSessions)).toHaveLength(1);

    const [user] = await db.select().from(dealerUsers).where(eq(dealerUsers.id, seeded.active.id));
    expect(await verifyPassword(user.passwordHash!, NEW_PASSWORD)).toBe(true);
    expect(await db.select().from(auditLog).where(eq(auditLog.action, "auth.password.reset"))).toHaveLength(1);
    expect(await consumeLinkToken("dealer", "reset", token, NEW_PASSWORD, meta)).toEqual({ ok: false, error: "used" });
  });
});
