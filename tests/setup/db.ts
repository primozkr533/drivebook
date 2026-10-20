import { getTableName, isTable, sql, type Table } from "drizzle-orm";
import { createDb, type Db } from "@/db/client";
import * as schema from "@/db/schema";
import { getConfig } from "@/lib/config";

export function testDatabaseUrl(): string {
  const { testDatabaseUrl, databaseUrl } = getConfig();
  if (testDatabaseUrl === databaseUrl) {
    throw new Error("TEST_DATABASE_URL must not point at the dev database (DATABASE_URL)");
  }
  return testDatabaseUrl;
}

let db: Db | undefined;

export function getTestDb(): Db {
  db ??= createDb(testDatabaseUrl());
  return db;
}

const tableNames = Object.values(schema)
  .filter(isTable)
  .map((table) => `"${getTableName(table as Table)}"`);

export async function truncateAll(): Promise<void> {
  await getTestDb().execute(sql.raw(`TRUNCATE ${tableNames.join(", ")} RESTART IDENTITY CASCADE`));
}
