import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { FileStorage } from "./types";

const MAX_KEY_LENGTH = 200;
const SEGMENT = /^[A-Za-z0-9._-]+$/;
const META_SUFFIX = ".meta.json";

export function isValidStorageKey(key: string): boolean {
  if (typeof key !== "string" || key.length === 0 || key.length > MAX_KEY_LENGTH) return false;
  if (key.endsWith(META_SUFFIX)) return false;
  return key.split("/").every((segment) => SEGMENT.test(segment) && segment !== "." && segment !== "..");
}

export class InvalidStorageKeyError extends Error {
  constructor(key: string) {
    super(`Invalid storage key: ${JSON.stringify(key)}`);
    this.name = "InvalidStorageKeyError";
  }
}

async function writeAtomic(file: string, data: Buffer | Uint8Array | string): Promise<void> {
  const tmp = `${file}.${randomBytes(6).toString("hex")}.tmp`;
  try {
    await writeFile(tmp, data);
    await rename(tmp, file);
  } catch (error) {
    await rm(tmp, { force: true });
    throw error;
  }
}

function isNotFound(error: unknown): boolean {
  return (error as NodeJS.ErrnoException)?.code === "ENOENT";
}

export function createLocalStorage(rootDir: string): FileStorage {
  const root = path.resolve(rootDir);
  const filePath = (key: string) => path.join(root, ...key.split("/"));

  return {
    async put(key, data, contentType) {
      if (!isValidStorageKey(key)) throw new InvalidStorageKeyError(key);
      const file = filePath(key);
      await mkdir(path.dirname(file), { recursive: true });
      // Sidecar first so a readable file always has its content type.
      await writeAtomic(file + META_SUFFIX, JSON.stringify({ contentType }));
      await writeAtomic(file, data);
    },

    async get(key) {
      if (!isValidStorageKey(key)) return null;
      const file = filePath(key);
      let data: Buffer;
      let meta: string;
      try {
        [data, meta] = await Promise.all([readFile(file), readFile(file + META_SUFFIX, "utf8")]);
      } catch (error) {
        if (isNotFound(error)) return null;
        throw error;
      }
      const { contentType } = JSON.parse(meta) as { contentType: string };
      return { data, contentType, size: data.byteLength };
    },

    async delete(key) {
      if (!isValidStorageKey(key)) throw new InvalidStorageKeyError(key);
      const file = filePath(key);
      await rm(file, { force: true });
      await rm(file + META_SUFFIX, { force: true });
    },

    url(key) {
      return `/api/files/${key.split("/").map(encodeURIComponent).join("/")}`;
    },
  };
}
