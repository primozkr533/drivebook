import type { PoolClient } from "pg";
import { getDb, type Db } from "@/db/client";
import { runMigrations } from "@/db/migrate";
import { runSeed } from "@/db/seed";
import { getConfig } from "@/lib/config";

// Arbitrary app-wide key so concurrent replicas serialise migrate + seed.
export const STARTUP_LOCK_KEY = 4_172_026_101;

export type RetryOptions = {
  intervalMs?: number;
  timeoutMs?: number;
  label?: string;
};

export async function withRetry<T>(
  fn: () => Promise<T>,
  { intervalMs = 2_000, timeoutMs = 120_000, label = "operation" }: RetryOptions = {},
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      if (Date.now() + intervalMs > deadline) {
        throw new Error(`${label} failed after ${attempt} attempts: ${reason}`, { cause: error });
      }
      console.warn(`[startup] ${label} attempt ${attempt} failed (${reason}); retrying in ${intervalMs} ms`);
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }
}

export type StartupOptions = {
  db?: () => Db;
  retry?: RetryOptions;
};

let resolveReady: (ok: boolean) => void = () => {};

// Resolves true once startup tasks succeeded, false if they finally failed; never rejects.
export const startupReady: Promise<boolean> = new Promise((resolve) => {
  resolveReady = resolve;
});

export async function runStartupTasks(options: StartupOptions = {}): Promise<boolean> {
  const ok = await runTasks(options).then(
    () => true,
    (error: unknown) => {
      console.error("[startup] Database migrations/seed FAILED; the app is running without a ready database.", error);
      return false;
    },
  );
  resolveReady(ok);
  return ok;
}

async function runTasks({ db: resolveDb = getDb, retry }: StartupOptions): Promise<void> {
  const { runMigrationsOnStart, seedOnStart } = getConfig();
  if (!runMigrationsOnStart && !seedOnStart) {
    console.log("[startup] Migrations and seed disabled; nothing to do");
    return;
  }

  const db = resolveDb();
  const lock = await withRetry(() => acquireLock(db), { label: "Database connection", ...retry });
  try {
    if (runMigrationsOnStart) {
      await runMigrations(db);
      console.log("[startup] Migrations applied");
    }
    if (seedOnStart) {
      await runSeed(db);
      console.log("[startup] Seed applied");
    }
  } finally {
    await lock.query("SELECT pg_advisory_unlock($1)", [STARTUP_LOCK_KEY]).catch(() => {});
    lock.release();
  }
}

async function acquireLock(db: Db): Promise<PoolClient> {
  const client = await db.$client.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [STARTUP_LOCK_KEY]);
    return client;
  } catch (error) {
    client.release(true);
    throw error;
  }
}
