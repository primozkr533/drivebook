import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetConfigForTests } from "@/lib/config";

vi.mock("@/db/migrate", () => ({ runMigrations: vi.fn() }));
vi.mock("@/db/seed", () => ({ runSeed: vi.fn() }));

const { runMigrations } = await import("@/db/migrate");
const { runSeed } = await import("@/db/seed");
const { runStartupTasks, startupReady, withRetry } = await import("@/server/startup");

const originalEnv = { ...process.env };

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete process.env.RUN_MIGRATIONS_ON_START;
  delete process.env.SEED_ON_START;
  process.env = { ...originalEnv };
  resetConfigForTests();
});

describe("withRetry", () => {
  it("retries a failing connect function and resolves once it succeeds", async () => {
    vi.useFakeTimers();
    const connect = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("ECONNREFUSED"))
      .mockRejectedValueOnce(new Error("the database system is starting up"))
      .mockResolvedValue("connected");

    const result = withRetry(connect, { intervalMs: 2_000, timeoutMs: 120_000 });
    await vi.advanceTimersByTimeAsync(0);
    expect(connect).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(connect).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(2_000);

    await expect(result).resolves.toBe("connected");
    expect(connect).toHaveBeenCalledTimes(3);
    expect(console.warn).toHaveBeenCalledTimes(2);
  });

  it("gives up after the timeout with the last error", async () => {
    vi.useFakeTimers();
    const connect = vi.fn<() => Promise<never>>().mockRejectedValue(new Error("ECONNREFUSED"));

    const result = withRetry(connect, { intervalMs: 2_000, timeoutMs: 10_000, label: "Database connection" });
    const assertion = expect(result).rejects.toThrow(/Database connection failed after 6 attempts: ECONNREFUSED/);
    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;
    expect(connect).toHaveBeenCalledTimes(6);
  });
});

describe("runStartupTasks", () => {
  it("runs no tasks when migrations and seed are disabled", async () => {
    process.env.RUN_MIGRATIONS_ON_START = "false";
    process.env.SEED_ON_START = "false";
    resetConfigForTests();
    const db = vi.fn();

    await expect(runStartupTasks({ db })).resolves.toBe(true);

    expect(db).not.toHaveBeenCalled();
    expect(runMigrations).not.toHaveBeenCalled();
    expect(runSeed).not.toHaveBeenCalled();
    await expect(startupReady).resolves.toBe(true);
  });

  it("logs an error and resolves false instead of throwing when the database never comes up", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const connect = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const db = () => ({ $client: { connect } }) as never;

    await expect(runStartupTasks({ db, retry: { intervalMs: 1, timeoutMs: 5 } })).resolves.toBe(false);

    expect(connect).toHaveBeenCalled();
    expect(runMigrations).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(expect.stringMatching(/FAILED/), expect.any(Error));
  });

  it("rejects before touching the database when production providers are missing", async () => {
    Object.assign(process.env, {
      APP_ENV: "production",
      DATABASE_URL: "postgres://x",
      BASE_DOMAIN: "drivebook.si",
      AUTH_SECRET: "x".repeat(32),
      NOTIFY_FAKE: "1",
    });
    resetConfigForTests();
    const db = vi.fn();

    await expect(runStartupTasks({ db })).rejects.toThrow(/Production requires real providers/);

    expect(db).not.toHaveBeenCalled();
    expect(runMigrations).not.toHaveBeenCalled();
  });
});
