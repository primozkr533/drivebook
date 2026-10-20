export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // Build workers may load instrumentation too; only a running server should touch the DB.
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const { runStartupTasks } = await import("./server/startup");
  // Not awaited: the server must listen while the database is still coming up.
  void runStartupTasks();
}
