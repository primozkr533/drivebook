import { getConfig } from "@/lib/config";
import { createBoss, startNotificationWorker } from "@/server/notify/queue";

async function main(): Promise<void> {
  const boss = createBoss(getConfig().databaseUrl, { worker: true });
  await boss.start();
  await startNotificationWorker(boss);
  console.log("[worker] Notification worker started");

  let stopping = false;
  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    console.log(`[worker] ${signal} received, stopping`);
    try {
      await boss.stop({ graceful: true, timeout: 20_000 });
      process.exit(0);
    } catch (error) {
      console.error("[worker] Shutdown failed", error);
      process.exit(1);
    }
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((error) => {
  console.error("[worker] Failed to start", error);
  process.exit(1);
});
