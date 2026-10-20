import { eq } from "drizzle-orm";
import { backofficeUsers } from "@/db/schema";
import { db } from "@/server/data/db";
import { stopBoss } from "@/server/notify/queue";
import { createInvitation, createPasswordReset } from "./links";
import { normalizeEmail } from "./rate-limit";

export const USAGE = "Usage: npm run create-superadmin -- --email <address>";

type Io = { log: (line: string) => void; error: (line: string) => void };

function parseEmail(argv: string[]): string | null {
  let value: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--email") value = argv[i + 1];
    else if (argv[i].startsWith("--email=")) value = argv[i].slice("--email=".length);
  }
  const email = value ? normalizeEmail(value) : "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

async function upsertSuperadmin(email: string) {
  const [existing] = await db()
    .select({ id: backofficeUsers.id, status: backofficeUsers.status })
    .from(backofficeUsers)
    .where(eq(backofficeUsers.email, email))
    .limit(1);
  if (!existing) {
    const [created] = await db()
      .insert(backofficeUsers)
      .values({ email, name: email.split("@")[0], role: "superadmin", status: "invited" })
      .returning({ id: backofficeUsers.id, status: backofficeUsers.status });
    return created;
  }
  // Active users keep their password until they use the reset link; anyone else is re-invited.
  const status = existing.status === "active" ? "active" : "invited";
  await db()
    .update(backofficeUsers)
    .set({ role: "superadmin", status, updatedAt: new Date() })
    .where(eq(backofficeUsers.id, existing.id));
  return { id: existing.id, status };
}

export async function main(argv: string[], io: Io = console): Promise<number> {
  const email = parseEmail(argv);
  if (!email) {
    io.error(USAGE);
    return 1;
  }
  try {
    const user = await upsertSuperadmin(email);
    const { link } =
      user.status === "active" ? await createPasswordReset("backoffice", user.id) : await createInvitation("backoffice", user.id);
    io.log(`Set-password link: ${link}`);
    return 0;
  } finally {
    await stopBoss();
  }
}

if (process.argv[1]?.endsWith("create-superadmin-cli.ts")) {
  main(process.argv.slice(2))
    .catch((error: unknown) => {
      console.error(error);
      return 1;
    })
    .then(async (code) => {
      await db().$client.end();
      process.exit(code);
    });
}
