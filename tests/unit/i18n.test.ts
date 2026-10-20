import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { messages } from "./i18n";

const dir = join(process.cwd(), "messages/sl");
const namespaces = ["common", "dealerPage", "auth", "privacy", "errors"];

describe("sl messages", () => {
  it("has exactly the expected namespace files", () => {
    const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
    expect(files.map((f) => f.replace(/\.json$/, "")).sort()).toEqual([...namespaces].sort());
  });

  it.each(namespaces)("%s.json is valid JSON object", (ns) => {
    const parsed: unknown = JSON.parse(readFileSync(join(dir, `${ns}.json`), "utf8"));
    expect(parsed).toBeTypeOf("object");
    expect(Array.isArray(parsed)).toBe(false);
  });

  it("merges every namespace under its own key", () => {
    expect(Object.keys(messages).sort()).toEqual([...namespaces].sort());
    expect(messages.common.appName).toBe("DriveBook");
    expect(messages.errors.notFoundTitle).toBe("Strani ni mogoče najti");
  });
});
