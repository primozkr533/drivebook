// Real-database tests: start Postgres with `docker compose up -d db` (uses TEST_DATABASE_URL).
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { devOutbox, messageLog } from "@/db/schema";
import { resetConfigForTests } from "@/lib/config";
import { setDbForTests } from "@/server/data/db";
import type { EmailProvider } from "@/server/notify/providers";
import {
  drainNotificationsForTest,
  sendEmail,
  sendSms,
  setBossForTests,
  stopBossForTests,
  type NotifyBoss,
} from "@/server/notify/queue";
import { getTestDb, truncateAll } from "../setup/db";

const providerOverride = vi.hoisted(() => ({ email: undefined as EmailProvider | undefined }));

vi.mock("@/server/notify/providers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/notify/providers")>();
  return {
    ...actual,
    getEmailProvider: () => providerOverride.email ?? actual.getEmailProvider(),
  };
});

const db = getTestDb();
const previousAppEnv = process.env.APP_ENV;

const email = {
  template: "invitation",
  to: "prodajalec@example.si",
  senderName: "DriveBook",
  subject: "Povabilo v DriveBook",
  html: "<p>Pozdravljeni</p>",
  text: "Pozdravljeni",
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
});
afterEach(() => {
  providerOverride.email = undefined;
  setBossForTests(undefined);
  vi.restoreAllMocks();
});
afterAll(async () => {
  await stopBossForTests();
  setDbForTests(undefined);
  if (previousAppEnv === undefined) delete process.env.APP_ENV;
  else process.env.APP_ENV = previousAppEnv;
  resetConfigForTests();
});

describe("notification queue", () => {
  it("queues an e-mail and sends it through the fake provider when drained", async () => {
    await sendEmail(email);

    const [queued] = await db.select().from(messageLog);
    expect(queued).toMatchObject({
      status: "queued",
      channel: "email",
      template: "invitation",
      recipient: "prodajalec@example.si",
      dealerId: null,
    });

    expect(await drainNotificationsForTest()).toBe(1);

    const [sent] = await db.select().from(messageLog);
    expect(sent.status).toBe("sent");
    expect(sent.provider).toBe("fake");
    expect(sent.providerMessageId).toMatch(/^fake-/);
    expect(sent.error).toBeNull();

    const outbox = await db.select().from(devOutbox);
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({ channel: "email", recipient: "prodajalec@example.si", subject: "Povabilo v DriveBook" });
  });

  it("marks the row failed with the error after retries when the provider throws", async () => {
    const send = vi.fn().mockRejectedValue(new Error("Brevo 503"));
    providerOverride.email = { name: "brevo", send };

    await expect(sendEmail(email)).resolves.toBeUndefined();
    await drainNotificationsForTest();

    expect(send).toHaveBeenCalledTimes(4);
    const [row] = await db.select().from(messageLog);
    expect(row).toMatchObject({ status: "failed", provider: "brevo", error: "Brevo 503" });
    expect(await db.select().from(devOutbox)).toHaveLength(0);
  });

  it("does not propagate an enqueue failure and records it on the row", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const boss: NotifyBoss = { send: vi.fn().mockRejectedValue(new Error("queue down")) };
    setBossForTests(boss);

    await expect(sendEmail(email)).resolves.toBeUndefined();

    const [row] = await db.select().from(messageLog);
    expect(row).toMatchObject({ status: "failed", error: "queue down" });
    expect(consoleError).toHaveBeenCalled();
  });

  it("records sms_segments for a sent SMS", async () => {
    const sms = { template: "booking-confirmed", to: "+38641000000", body: "č".repeat(71), alphaSender: "AvtoDemo" };
    await sendSms(sms);
    await drainNotificationsForTest();

    const [row] = await db.select().from(messageLog);
    expect(row).toMatchObject({ status: "sent", channel: "sms", provider: "fake", smsSegments: 2 });
    const [outbox] = await db.select().from(devOutbox);
    expect(outbox).toMatchObject({ channel: "sms", sender: "AvtoDemo" });
  });
});
