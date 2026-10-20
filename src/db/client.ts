import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { getConfig } from "@/lib/config";
import * as schema from "./schema";

export function createDb(url: string) {
  return drizzle({ client: new Pool({ connectionString: url }), schema });
}

export type Db = ReturnType<typeof createDb>;

let db: Db | undefined;

export function getDb(): Db {
  db ??= createDb(getConfig().databaseUrl);
  return db;
}
