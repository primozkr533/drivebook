import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { newPublicId } from "@/db/ids";
import { createLocalStorage, isValidStorageKey } from "@/server/storage/local";
import type { FileStorage } from "@/server/storage/types";

let parent: string;
let root: string;
let storage: FileStorage;

async function listRecursive(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries.filter((e) => e.isFile()).map((e) => path.relative(dir, path.join(e.parentPath, e.name)));
}

beforeEach(async () => {
  parent = await mkdtemp(path.join(tmpdir(), "drivebook-storage-"));
  root = path.join(parent, "root");
  storage = createLocalStorage(root);
});

afterEach(async () => {
  await rm(parent, { recursive: true, force: true });
});

describe("local storage", () => {
  it("round-trips bytes and content type", async () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 255]);
    await storage.put("logos/abc.png", bytes, "image/png");
    const file = await storage.get("logos/abc.png");
    expect(file).not.toBeNull();
    expect(new Uint8Array(file!.data)).toEqual(bytes);
    expect(file!.contentType).toBe("image/png");
    expect(file!.size).toBe(5);
  });

  it("overwrites an existing key and leaves no temp files", async () => {
    await storage.put("a.txt", Buffer.from("one"), "text/plain");
    await storage.put("a.txt", Buffer.from("second"), "text/markdown");
    const file = await storage.get("a.txt");
    expect(file!.data.toString()).toBe("second");
    expect(file!.contentType).toBe("text/markdown");
    expect((await listRecursive(root)).sort()).toEqual(["a.txt", "a.txt.meta.json"]);
  });

  it("returns null for a missing key", async () => {
    expect(await storage.get("logos/missing.png")).toBeNull();
  });

  it("deletes the file and its sidecar, and delete is idempotent", async () => {
    await storage.put("logos/x.png", Buffer.from("x"), "image/png");
    await storage.delete("logos/x.png");
    await expect(storage.delete("logos/x.png")).resolves.toBeUndefined();
    expect(await storage.get("logos/x.png")).toBeNull();
    expect(await listRecursive(root)).toEqual([]);
  });

  it("accepts a key built from a real newPublicId()", async () => {
    for (let i = 0; i < 20; i++) {
      const key = `logos/${newPublicId()}.png`;
      expect(isValidStorageKey(key)).toBe(true);
      await storage.put(key, Buffer.from("png"), "image/png");
      expect((await storage.get(key))?.contentType).toBe("image/png");
    }
  });

  it("builds app-relative URLs", () => {
    expect(storage.url("logos/abc.png")).toBe("/api/files/logos/abc.png");
  });

  const invalidKeys = [
    "",
    "../escape.png",
    "logos/../../escape.png",
    "logos/..",
    "./a.png",
    "/etc/passwd",
    "logos\\..\\escape.png",
    "logos//a.png",
    "logos/a.png/",
    "logos/a b.png",
    "logos/ä.png",
    "logos/a%2F.png",
    "logos/a.png.meta.json",
    "a".repeat(201),
  ];

  it.each(invalidKeys)("rejects invalid key %j", async (key) => {
    expect(isValidStorageKey(key)).toBe(false);
    await expect(storage.put(key, Buffer.from("x"), "text/plain")).rejects.toThrow(/Invalid storage key/);
    expect(await storage.get(key)).toBeNull();
    await expect(storage.delete(key)).rejects.toThrow(/Invalid storage key/);
  });

  it("writes nothing outside the root dir for rejected keys", async () => {
    for (const key of invalidKeys) {
      await storage.put(key, Buffer.from("x"), "text/plain").catch(() => undefined);
    }
    expect(await readdir(parent)).toEqual([]);
  });

  it("does not serve sidecars", async () => {
    await storage.put("logos/abc.png", Buffer.from("x"), "image/png");
    expect(await storage.get("logos/abc.png.meta.json")).toBeNull();
  });

  it("allows a 200-character key", () => {
    expect(isValidStorageKey(`${"a".repeat(196)}.png`)).toBe(true);
  });
});

describe("getStorage", () => {
  it("is a singleton rooted at getConfig().storageDir", async () => {
    vi.resetModules();
    vi.doMock("@/lib/config", () => ({ getConfig: () => ({ storageDir: root }) }));
    try {
      const { getStorage } = await import("@/server/storage");
      expect(getStorage()).toBe(getStorage());
      await getStorage().put("logos/cfg.png", Buffer.from("x"), "image/png");
      expect(await listRecursive(root)).toContain(path.join("logos", "cfg.png"));
    } finally {
      vi.doUnmock("@/lib/config");
    }
  });
});
