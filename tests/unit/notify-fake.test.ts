// Real-database tests: start Postgres with `docker compose up -d db` (uses TEST_DATABASE_URL).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { devOutbox } from "@/db/schema";
import { setDbForTests } from "@/server/data/db";
import { createFakeEmailProvider, createFakeSmsProvider } from "@/server/notify/providers/fake";
import { getTestDb, truncateAll } from "../setup/db";

const db = getTestDb();

beforeAll(() => setDbForTests(db));
beforeEach(() => truncateAll());
afterAll(() => setDbForTests(undefined));

const FAKE_ID = /^fake-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe("fake notification providers", () => {
  it("writes an e-mail to dev_outbox", async () => {
    const result = await createFakeEmailProvider().send({
      to: "kupec@example.si",
      senderName: "Avto Demo",
      subject: "Povabilo",
      html: "<p>Živjo</p>",
      text: "Živjo",
    });
    expect(result.providerMessageId).toMatch(FAKE_ID);

    const rows = await db.select().from(devOutbox);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      channel: "email",
      recipient: "kupec@example.si",
      sender: "Avto Demo",
      subject: "Povabilo",
      textBody: "Živjo",
      htmlBody: "<p>Živjo</p>",
    });
  });

  it("writes an SMS to dev_outbox and counts its segments", async () => {
    const body = "Vaša testna vožnja je potrjena.";
    const result = await createFakeSmsProvider("+38640123456").send({ to: "+38641000000", body, alphaSender: "AvtoDemo" });
    expect(result.providerMessageId).toMatch(FAKE_ID);
    expect(result.segments).toBe(1);

    const rows = await db.select().from(devOutbox);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      channel: "sms",
      recipient: "+38641000000",
      sender: "AvtoDemo",
      subject: null,
      textBody: body,
      htmlBody: null,
    });
  });

  it("records the from number when the alpha sender is invalid", async () => {
    const result = await createFakeSmsProvider("+38640123456").send({ to: "+38641000000", body: "č".repeat(71), alphaSender: "12345" });
    expect(result.segments).toBe(2);
    const [row] = await db.select().from(devOutbox);
    expect(row.sender).toBe("+38640123456");
  });
});
