import { getConfig } from "@/lib/config";
import { createLocalStorage } from "./local";
import type { FileStorage } from "./types";

export type { FileStorage } from "./types";
export { createLocalStorage, InvalidStorageKeyError, isValidStorageKey } from "./local";

let storage: FileStorage | undefined;

export function getStorage(): FileStorage {
  storage ??= createLocalStorage(getConfig().storageDir);
  return storage;
}
