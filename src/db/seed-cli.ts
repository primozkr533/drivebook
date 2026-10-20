import { getDb } from "./client";
import { runSeed } from "./seed";

async function main() {
  const db = getDb();
  try {
    await runSeed(db);
    console.log("Seed applied");
  } finally {
    await db.$client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
