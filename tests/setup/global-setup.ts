import { createDb } from "@/db/client";
import { runMigrations } from "@/db/migrate";
import { testDatabaseUrl } from "./db";

export default async function setup() {
  const db = createDb(testDatabaseUrl());
  try {
    await runMigrations(db);
  } finally {
    await db.$client.end();
  }
}
