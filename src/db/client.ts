import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { getConfig } from "@/lib/config";
import * as schema from "./schema";

export function createDb(url: string) {
  const pool = new Pool({ connectionString: url });
  // Without a listener, an idle client dropped by a DB restart would crash the server.
  pool.on("error", (error) => console.error("[db] Idle connection error", error));
  return drizzle({ client: pool, schema });
}

export type Db = ReturnType<typeof createDb>;

let db: Db | undefined;

export function getDb(): Db {
  db ??= createDb(getConfig().databaseUrl);
  return db;
}
