import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { auditLog, backofficeUsers, dealerUsers } from "@/db/schema";
import { getConfig } from "@/lib/config";
import { db } from "@/server/data/db";
import { hashPassword, verifyPassword } from "./password";
import { isLoginRateLimited, normalizeEmail, recordLoginAttempt } from "./rate-limit";
import { createSession, destroyCurrentSession, getCurrentSession, type AuthSurface } from "./session";
import { acceptTotpCode, decryptTotpSecret } from "./totp";

export const PENDING_TOKEN_TTL_MS = 5 * 60 * 1000;

export type LoginInput = {
  surface: AuthSurface;
  email: string;
  password?: string;
  totpCode?: string;
  pendingToken?: string;
  ip: string;
  userAgent?: string | null;
};

export type LoginResult =
  | { ok: true; token: string }
  | { ok: false; error: "invalid" | "rate_limited" }
  | { ok: false; error: "totp_required" | "totp_invalid"; pendingToken: string };

type LoginUser = {
  id: string;
  email: string;
  status: string;
  passwordHash: string | null;
  totpSecretEnc: string | null;
  totpEnabledAt: Date | null;
  dealerId: string | null;
};

type Executor = Pick<ReturnType<typeof db>, "insert">;

export type AuthAuditEntry = {
  surface: AuthSurface;
  action: string;
  actorId?: string | null;
  dealerId?: string | null;
  email?: string | null;
  ip?: string | null;
  reason?: string | null;
  data?: Record<string, unknown>;
};

export async function writeAuthAudit(entry: AuthAuditEntry, executor: Executor = db()): Promise<void> {
  const entity = entry.surface === "dealer" ? "dealer_user" : "backoffice_user";
  await executor.insert(auditLog).values({
    dealerId: entry.surface === "dealer" ? (entry.dealerId ?? null) : null,
    actorKind: entity,
    actorId: entry.actorId ?? null,
    action: entry.action,
    entity,
    entityId: entry.actorId ?? null,
    data: {
      ...entry.data,
      surface: entry.surface,
      email: entry.email ?? null,
      ip: entry.ip ?? null,
      reason: entry.reason ?? null,
    },
  });
}

const INVALID = { ok: false, error: "invalid" } as const;

export async function login(input: LoginInput): Promise<LoginResult> {
  const { surface, ip } = input;
  if (input.pendingToken) return loginWithTotp(input, input.pendingToken);

  const email = normalizeEmail(input.email);
  if (await isLoginRateLimited(surface, email, ip)) {
    return blocked(input, email, null);
  }

  const user = email ? await findUserByEmail(surface, email) : null;
  // Always verify against some hash so unknown emails take as long as known ones.
  const passwordOk = await verifyPassword(user?.passwordHash ?? (await dummyHash()), input.password ?? "");
  if (!user || !user.passwordHash || user.status !== "active" || !passwordOk) {
    const reason = !user
      ? "unknown_email"
      : !user.passwordHash
        ? "no_password"
        : user.status !== "active"
          ? "inactive"
          : "wrong_password";
    await fail(input, email, user, reason);
    return INVALID;
  }

  if (user.totpEnabledAt && user.totpSecretEnc) {
    return { ok: false, error: "totp_required", pendingToken: signPendingToken(surface, user.id) };
  }
  return succeed(input, user);
}

async function loginWithTotp(input: LoginInput, pendingToken: string): Promise<LoginResult> {
  const { surface, ip } = input;
  const userId = verifyPendingToken(surface, pendingToken);
  const user = userId ? await findUserById(surface, userId) : null;
  if (!user || user.status !== "active" || !user.passwordHash || !user.totpEnabledAt || !user.totpSecretEnc) {
    await fail(input, normalizeEmail(user?.email ?? input.email), user, "pending_token_invalid");
    return INVALID;
  }

  if (await isLoginRateLimited(surface, user.email, ip)) {
    return blocked(input, user.email, user);
  }

  if (!(await acceptTotpCode(surface, user.id, decryptTotpSecret(user.totpSecretEnc), input.totpCode ?? ""))) {
    await fail(input, user.email, user, "totp_invalid");
    return { ok: false, error: "totp_invalid", pendingToken };
  }
  return succeed(input, user);
}

async function succeed(input: LoginInput, user: LoginUser): Promise<LoginResult> {
  const token = await createSession(input.surface, user.id, { ip: input.ip, userAgent: input.userAgent });
  await recordLoginAttempt(input.surface, user.email, input.ip, true);
  await writeAuthAudit({
    surface: input.surface,
    action: "auth.login.success",
    actorId: user.id,
    dealerId: user.dealerId,
    email: user.email,
    ip: input.ip,
  });
  return { ok: true, token };
}

async function fail(input: LoginInput, email: string, user: LoginUser | null, reason: string): Promise<void> {
  await recordLoginAttempt(input.surface, email, input.ip, false);
  await auditFailure(input, email, user, reason);
}

// Blocked attempts are audited but not counted, so they can't keep sliding the lockout window.
async function blocked(input: LoginInput, email: string, user: LoginUser | null): Promise<LoginResult> {
  await auditFailure(input, email, user, "rate_limited");
  return { ok: false, error: "rate_limited" };
}

async function auditFailure(input: LoginInput, email: string, user: LoginUser | null, reason: string): Promise<void> {
  await writeAuthAudit({
    surface: input.surface,
    action: "auth.login.failure",
    actorId: user?.id,
    dealerId: user?.dealerId,
    email,
    ip: input.ip,
    reason,
  });
}

export async function logout(surface: AuthSurface): Promise<void> {
  const current = await getCurrentSession(surface);
  await destroyCurrentSession(surface);
  if (!current) return;
  await writeAuthAudit({
    surface,
    action: "auth.logout",
    actorId: current.user.id,
    dealerId: "dealerId" in current.user ? current.user.dealerId : null,
    email: current.user.email,
    ip: current.session.ip,
  });
}

let dummy: Promise<string> | undefined;
function dummyHash(): Promise<string> {
  dummy ??= hashPassword(randomBytes(16).toString("hex"));
  return dummy;
}

const userColumns = {
  dealer: {
    id: dealerUsers.id,
    email: dealerUsers.email,
    status: dealerUsers.status,
    passwordHash: dealerUsers.passwordHash,
    totpSecretEnc: dealerUsers.totpSecretEnc,
    totpEnabledAt: dealerUsers.totpEnabledAt,
    dealerId: dealerUsers.dealerId,
  },
  backoffice: {
    id: backofficeUsers.id,
    email: backofficeUsers.email,
    status: backofficeUsers.status,
    passwordHash: backofficeUsers.passwordHash,
    totpSecretEnc: backofficeUsers.totpSecretEnc,
    totpEnabledAt: backofficeUsers.totpEnabledAt,
  },
};

async function findUser(surface: AuthSurface, by: "id" | "email", value: string): Promise<LoginUser | null> {
  if (surface === "dealer") {
    const [row] = await db()
      .select(userColumns.dealer)
      .from(dealerUsers)
      .where(eq(dealerUsers[by], value))
      .limit(1);
    return row ?? null;
  }
  const [row] = await db()
    .select(userColumns.backoffice)
    .from(backofficeUsers)
    .where(eq(backofficeUsers[by], value))
    .limit(1);
  return row ? { ...row, dealerId: null } : null;
}

const findUserByEmail = (surface: AuthSurface, email: string) => findUser(surface, "email", email);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const findUserById = (surface: AuthSurface, id: string) => (UUID_RE.test(id) ? findUser(surface, "id", id) : null);

function pendingSignature(payload: string): Buffer {
  return createHmac("sha256", getConfig().authSecret).update(`login-pending.${payload}`).digest();
}

export function signPendingToken(surface: AuthSurface, userId: string, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ s: surface, u: userId, e: now + PENDING_TOKEN_TTL_MS })).toString(
    "base64url",
  );
  return `${payload}.${pendingSignature(payload).toString("base64url")}`;
}

function verifyPendingToken(surface: AuthSurface, token: string): string | null {
  const [payload, sig, ...rest] = token.split(".");
  if (!payload || !sig || rest.length > 0) return null;
  const expected = pendingSignature(payload);
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { s?: unknown; u?: unknown; e?: unknown };
    if (data.s !== surface || typeof data.u !== "string" || typeof data.e !== "number" || data.e <= Date.now()) {
      return null;
    }
    return data.u;
  } catch {
    return null;
  }
}
