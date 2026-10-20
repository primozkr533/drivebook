import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "../..");
const GUARDED = ["src/app", "src/components", "src/middleware.ts", "src/proxy.ts"];
const FORBIDDEN = /from\s+["'](?:@\/|(?:\.\.?\/)+)db\/(?:client|schema)(?:\/[^"']*)?["']|import\(\s*["'](?:@\/|(?:\.\.?\/)+)db\/(?:client|schema)/;

function sourceFiles(path: string): string[] {
  if (!existsSync(path)) return [];
  if (!statSync(path).isDirectory()) return /\.(ts|tsx|js|jsx|mjs)$/.test(path) ? [path] : [];
  return readdirSync(path).flatMap((entry) => sourceFiles(join(path, entry)));
}

describe("database import guard", () => {
  it("keeps pages, components and middleware off the raw database", () => {
    const offenders = GUARDED.flatMap((p) => sourceFiles(join(root, p)))
      .filter((file) => FORBIDDEN.test(readFileSync(file, "utf8")))
      .map((file) => relative(root, file));
    expect(offenders, "use @/server/data/* instead of @/db/client or @/db/schema").toEqual([]);
  });

  it("detects the forbidden imports", () => {
    expect(FORBIDDEN.test(`import { getDb } from "@/db/client";`)).toBe(true);
    expect(FORBIDDEN.test(`import { cars } from '@/db/schema/cars';`)).toBe(true);
    expect(FORBIDDEN.test(`import * as s from "../../db/schema";`)).toBe(true);
    expect(FORBIDDEN.test(`const m = await import("@/db/client");`)).toBe(true);
    expect(FORBIDDEN.test(`import { listActiveCars } from "@/server/data/cars";`)).toBe(false);
  });
});
