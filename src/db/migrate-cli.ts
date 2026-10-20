import { getDb } from "./client";
import { runMigrations } from "./migrate";

async function main() {
  const db = getDb();
  try {
    await runMigrations(db);
    console.log("Migrations applied");
  } finally {
    await db.$client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
