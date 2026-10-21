import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "../..");
const dockerfile = readFileSync(join(root, "Dockerfile"), "utf8");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { scripts: Record<string, string> };

const STORAGE_DIR = ["", "data", "storage"].join("/");

function stage(name: string): string {
  const match = dockerfile.match(new RegExp(`^FROM \\S+ AS ${name}\\n([\\s\\S]*?)(?=^FROM |(?![\\s\\S]))`, "m"));
  if (!match) throw new Error(`stage ${name} not found`);
  return match[1];
}

describe("production Dockerfile", () => {
  it("has a runner stage that runs as a non-root user", () => {
    const runner = stage("runner");
    const users = [...runner.matchAll(/^USER (\S+)/gm)].map((m) => m[1]);
    expect(users.length).toBeGreaterThan(0);
    expect(users.at(-1)).not.toMatch(/^(root|0)(:|$)/);
    expect(runner).toMatch(/adduser -S app/);
  });

  it("keeps the standalone server as the default command", () => {
    const runner = stage("runner");
    expect(runner).toContain("app/.next/standalone ./");
    expect(runner).toMatch(/^CMD \["start-web"\]$/m);
    expect(readFileSync(join(root, "docker/web/start.sh"), "utf8")).toMatch(/exec node server\.js/);
  });

  it("compiles the worker and CLIs and repoints their npm scripts in the runner", () => {
    const build = stage("build");
    expect(pkg.scripts["build:cli"]).toMatch(/^esbuild /);
    for (const entry of ["src/worker.ts", "src/db/migrate-cli.ts", "src/server/auth/create-superadmin-cli.ts", "src/server/auth/user-admin-cli.ts"]) {
      expect(pkg.scripts["build:cli"]).toContain(entry);
    }
    expect(build).toContain("npm run build:cli");
    expect(build).toContain('scripts.worker="node dist/worker.cjs"');
    expect(build).toContain('scripts.db:migrate="node dist/migrate-cli.cjs"');
    expect(build).toContain('scripts.create-superadmin="node dist/create-superadmin-cli.cjs"');
    expect(build).toContain('scripts.user-admin="node dist/user-admin-cli.cjs"');

    const runner = stage("runner");
    expect(runner).toContain("app/dist ./dist");
    expect(runner).toContain("runner/package.json ./package.json");
    expect(runner).toContain("app/drizzle ./drizzle");
  });

  it("keeps tsx scripts for local and dev compose use", () => {
    expect(pkg.scripts.worker).toBe("tsx src/worker.ts");
    expect(pkg.scripts["db:migrate"]).toBe("tsx src/db/migrate-cli.ts");
  });

  it("ships full production node_modules (sharp's native binary) and a writable storage dir", () => {
    expect(stage("prod-deps")).toMatch(/npm prune --omit=dev/);
    const runner = stage("runner");
    expect(runner).toMatch(/--from=prod-deps --chown=app:app \S+node_modules \.\/node_modules/);
    expect(runner).toContain(`STORAGE_DIR=${STORAGE_DIR}`);
    expect(runner).toContain(`mkdir -p ${STORAGE_DIR} && chown app:app ${STORAGE_DIR}`);
  });
});
