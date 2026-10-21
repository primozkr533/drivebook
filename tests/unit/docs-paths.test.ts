import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const docs = ["CLAUDE.md", "README.md", "docs/deploy.md", "docs/performance.md"];

function documentedPaths(doc: string): string[] {
  const text = readFileSync(join(process.cwd(), doc), "utf8");
  const tokens = [...text.matchAll(new RegExp("`([^`\\s]+)`", "g"))].map((m) => m[1]);
  return [
    ...new Set(tokens.filter((t) => /^(src|tests|messages|drizzle|docker|docs)\/|^\.env\.example$|^docker-compose[\w.]*\.yml$/.test(t) && !/[*{]/.test(t))),
  ];
}

describe.each(docs)("paths named in %s", (doc) => {
  const paths = documentedPaths(doc);

  it("names some repo paths", () => {
    expect(paths.length).toBeGreaterThan(0);
  });

  it.each(paths)("%s exists", (path) => {
    expect(existsSync(join(process.cwd(), path))).toBe(true);
  });
});
