import { defineConfig } from "drizzle-kit";
import { getConfig } from "@/lib/config";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dbCredentials: { url: getConfig().databaseUrl },
});
