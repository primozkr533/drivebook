import { eq } from "drizzle-orm";
import { backofficeUsers, dealerUsers } from "@/db/schema";
import { db } from "@/server/data/db";
import { stopBoss } from "@/server/notify/queue";
import { resendInvitation } from "./links";
import { normalizeEmail } from "./rate-limit";
import { deactivateUser, type AuthSurface } from "./session";

export const USAGE =
  "Usage: npm run user-admin -- <deactivate|resend-invite> --surface <dealer|backoffice> --email <address>";

type Io = { log: (line: string) => void; error: (line: string) => void };
type Command = "deactivate" | "resend-invite";
type Args = { command: Command; surface: AuthSurface; email: string };

function parseArgs(argv: string[]): Args | null {
  const [command, ...rest] = argv;
  const flags: Record<string, string | undefined> = {};
  for (let i = 0; i < rest.length; i++) {
    const match = rest[i].match(/^--(surface|email)(?:=(.*))?$/);
    if (!match) return null;
    flags[match[1]] = match[2] ?? rest[++i];
  }
  if (command !== "deactivate" && command !== "resend-invite") return null;
  const surface = flags.surface;
  if (surface !== "dealer" && surface !== "backoffice") return null;
  const email = flags.email ? normalizeEmail(flags.email) : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return { command, surface, email };
}

async function findUserId(surface: AuthSurface, email: string): Promise<string | null> {
  const users = surface === "dealer" ? dealerUsers : backofficeUsers;
  const [row] = await db().select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  return row?.id ?? null;
}

export async function main(argv: string[], io: Io = console): Promise<number> {
  const args = parseArgs(argv);
  if (!args) {
    io.error(USAGE);
    return 1;
  }
  const { command, surface, email } = args;
  try {
    const userId = await findUserId(surface, email);
    if (!userId) {
      io.error(`No ${surface} user with e-mail ${email}`);
      return 1;
    }
    if (command === "deactivate") {
      await deactivateUser(surface, userId);
      io.log(`Deactivated ${surface} user ${email}; all of their sessions were revoked.`);
      return 0;
    }
    const result = await resendInvitation(surface, userId);
    if (!result.ok) {
      io.error(`The ${surface} user ${email} is not in the invited state; use the password reset instead.`);
      return 1;
    }
    io.log(`Set-password link: ${result.link}`);
    return 0;
  } finally {
    await stopBoss();
  }
}

if (process.argv[1]?.endsWith("user-admin-cli.ts")) {
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
