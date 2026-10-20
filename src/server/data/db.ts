import { getDb, type Db } from "@/db/client";

let override: Db | undefined;

export function setDbForTests(db: Db | undefined): void {
  override = db;
}

export function db(): Db {
  return override ?? getDb();
}
