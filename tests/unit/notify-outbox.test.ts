// Real-database tests: start Postgres with `docker compose up -d db` (uses TEST_DATABASE_URL).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { devOutbox } from "@/db/schema";
import { setDbForTests } from "@/server/data/db";
import { listDevOutbox } from "@/server/notify/outbox";
import { getTestDb, truncateAll } from "../setup/db";

const db = getTestDb();

beforeAll(() => setDbForTests(db));
beforeEach(() => truncateAll());
afterAll(() => setDbForTests(undefined));

async function seed(count: number) {
  await db.insert(devOutbox).values(
    Array.from({ length: count }, (_, i) => ({
      channel: i % 2 ? ("sms" as const) : ("email" as const),
      recipient: `kupec${i}@example.si`,
      sender: "DriveBook",
      subject: `Sporočilo ${i}`,
      textBody: `Telo ${i}`,
      createdAt: new Date(Date.UTC(2026, 9, 20, 8, i)),
    })),
  );
}

describe("listDevOutbox", () => {
  it("returns messages newest first", async () => {
    await seed(3);
    const rows = await listDevOutbox();
    expect(rows.map((r) => r.subject)).toEqual(["Sporočilo 2", "Sporočilo 1", "Sporočilo 0"]);
    expect(rows[0]).toMatchObject({ channel: "email", recipient: "kupec2@example.si", textBody: "Telo 2", htmlBody: null });
  });

  it("limits to the given count", async () => {
    await seed(5);
    const rows = await listDevOutbox({ limit: 2 });
    expect(rows.map((r) => r.subject)).toEqual(["Sporočilo 4", "Sporočilo 3"]);
  });

  it("defaults to 50 messages", async () => {
    await seed(55);
    expect(await listDevOutbox()).toHaveLength(50);
  });
});
