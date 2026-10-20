// Real-database tests: start Postgres with `docker compose up -d db` (uses TEST_DATABASE_URL).
import { count, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { dealers, plans } from "@/db/schema";
import { DEMO_DEALER_SLUG } from "@/db/seed";
import { resetConfigForTests } from "@/lib/config";
import { runStartupTasks } from "@/server/startup";
import { getTestDb } from "../setup/db";

const db = getTestDb();

async function tableExists(name: string): Promise<boolean> {
  const result = await db.execute<{ exists: boolean }>(sql`SELECT to_regclass(${name}) IS NOT NULL AS exists`);
  return result.rows[0].exists;
}

beforeAll(async () => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  process.env.RUN_MIGRATIONS_ON_START = "true";
  process.env.SEED_ON_START = "true";
  resetConfigForTests();
  await db.execute(sql.raw(`DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;`));
});

afterEach(() => {
  resetConfigForTests();
});

afterAll(async () => {
  delete process.env.RUN_MIGRATIONS_ON_START;
  delete process.env.SEED_ON_START;
  resetConfigForTests();
  vi.restoreAllMocks();
  await db.$client.end();
});

describe("runStartupTasks against an empty database", () => {
  it("migrates and seeds, and a second run is a no-op", async () => {
    expect(await tableExists("public.dealers")).toBe(false);

    await expect(runStartupTasks({ db: () => db })).resolves.toBe(true);

    const slugs = await db.select({ slug: dealers.slug }).from(dealers);
    expect(slugs.map((d) => d.slug)).toEqual([DEMO_DEALER_SLUG]);
    const [migrations] = await db.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations`,
    ).then((r) => r.rows);

    await expect(runStartupTasks({ db: () => db })).resolves.toBe(true);

    const [again] = await db.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations`,
    ).then((r) => r.rows);
    expect(again.n).toBe(migrations.n);
    expect((await db.select({ n: count() }).from(dealers))[0].n).toBe(1);
    expect((await db.select({ n: count() }).from(plans))[0].n).toBe(1);
  });

  it("releases the advisory lock afterwards", async () => {
    const result = await db.execute<{ locked: boolean }>(
      sql`SELECT count(*) > 0 AS locked FROM pg_locks WHERE locktype = 'advisory' AND granted`,
    );
    expect(result.rows[0].locked).toBe(false);
  });
});
