import { and, count, eq, gte, isNull } from "drizzle-orm";
import { authTokens, backofficeSessions, backofficeUsers, dealers, dealerSessions, dealerUsers } from "@/db/schema";
import { surfaceOrigin } from "@/lib/config";
import { formatDate, formatTime } from "@/lib/date";
import { db } from "@/server/data/db";
import { renderInvitationEmail, renderPasswordResetEmail } from "@/server/notify/templates";
import { emailT } from "@/server/notify/templates/layout";
import { sendEmail } from "@/server/notify/queue";
import { writeAuthAudit } from "./login";
import { hashPassword, validateNewPassword } from "./password";
import { normalizeEmail } from "./rate-limit";
import { createSession, type AuthSurface } from "./session";
import { hashToken, newOpaqueToken } from "./tokens";

export type LinkPurpose = "invite" | "reset";
export type LinkTokenState = "valid" | "expired" | "used" | "invalid";

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const RESET_TTL_MS = 60 * 60 * 1000;
export const RESET_MAX_PER_HOUR = 3;
const RESET_RATE_WINDOW_MS = 60 * 60 * 1000;

const LINK_PATH = { invite: "set-password", reset: "reset-password" } as const;
// An invite is only redeemable by a not-yet-active user, a reset only by an active one.
const REQUIRED_STATUS = { invite: "invited", reset: "active" } as const;

type Clock = { now?: Date };
type Tx = Parameters<Parameters<ReturnType<typeof db>["transaction"]>[0]>[0];
type Executor = ReturnType<typeof db> | Tx;

type LinkUser = { id: string; email: string; status: string; dealerId: string | null; dealerName: string | null };

async function findUser(
  surface: AuthSurface,
  by: "id" | "email",
  value: string,
  executor: Executor = db(),
): Promise<LinkUser | null> {
  if (surface === "dealer") {
    const [row] = await executor
      .select({
        id: dealerUsers.id,
        email: dealerUsers.email,
        status: dealerUsers.status,
        dealerId: dealerUsers.dealerId,
        dealerName: dealers.name,
      })
      .from(dealerUsers)
      .innerJoin(dealers, eq(dealers.id, dealerUsers.dealerId))
      .where(eq(dealerUsers[by], value))
      .limit(1);
    return row ?? null;
  }
  const [row] = await executor
    .select({ id: backofficeUsers.id, email: backofficeUsers.email, status: backofficeUsers.status })
    .from(backofficeUsers)
    .where(eq(backofficeUsers[by], value))
    .limit(1);
  return row ? { ...row, dealerId: null, dealerName: null } : null;
}

async function requireUser(surface: AuthSurface, userId: string): Promise<LinkUser> {
  const user = await findUser(surface, "id", userId);
  if (!user) throw new Error(`Unknown ${surface} user`);
  return user;
}

async function issueToken(surface: AuthSurface, user: LinkUser, purpose: LinkPurpose, now: Date) {
  const token = newOpaqueToken();
  const expiresAt = new Date(now.getTime() + (purpose === "invite" ? INVITE_TTL_MS : RESET_TTL_MS));
  await db().transaction(async (tx) => {
    await tx
      .update(authTokens)
      .set({ usedAt: now })
      .where(
        and(
          eq(authTokens.surface, surface),
          eq(authTokens.userId, user.id),
          eq(authTokens.purpose, purpose),
          isNull(authTokens.usedAt),
        ),
      );
    await tx.insert(authTokens).values({
      surface,
      userId: user.id,
      purpose,
      tokenHash: hashToken(token),
      expiresAt,
      createdAt: now,
    });
  });
  return { link: `${surfaceOrigin(surface)}/${LINK_PATH[purpose]}/${token}`, expiresAt };
}

async function sendInvitation(surface: AuthSurface, user: LinkUser, now: Date): Promise<{ link: string }> {
  const { link, expiresAt } = await issueToken(surface, user, "invite", now);
  const email = renderInvitationEmail({
    surface,
    recipientEmail: user.email,
    dealerName: user.dealerName ?? undefined,
    link,
    expiresAt: emailT("expiresAt", { date: formatDate(expiresAt), time: formatTime(expiresAt) }),
  });
  await sendEmail({ ...email, to: user.email, dealerId: user.dealerId, template: "invitation" });
  return { link };
}

export async function createInvitation(surface: AuthSurface, userId: string, opts: Clock = {}): Promise<{ link: string }> {
  return sendInvitation(surface, await requireUser(surface, userId), opts.now ?? new Date());
}

export async function resendInvitation(
  surface: AuthSurface,
  userId: string,
  opts: Clock = {},
): Promise<{ ok: true; link: string } | { ok: false; error: "already_active" }> {
  const user = await requireUser(surface, userId);
  if (user.status !== "invited") return { ok: false, error: "already_active" };
  return { ok: true, ...(await sendInvitation(surface, user, opts.now ?? new Date())) };
}

export async function requestPasswordReset(surface: AuthSurface, email: string, opts: Clock = {}): Promise<void> {
  const now = opts.now ?? new Date();
  const normalized = normalizeEmail(email);
  const user = normalized ? await findUser(surface, "email", normalized) : null;
  if (!user || user.status !== "active") return;

  const [recent] = await db()
    .select({ n: count() })
    .from(authTokens)
    .where(
      and(
        eq(authTokens.surface, surface),
        eq(authTokens.userId, user.id),
        eq(authTokens.purpose, "reset"),
        gte(authTokens.createdAt, new Date(now.getTime() - RESET_RATE_WINDOW_MS)),
      ),
    );
  if ((recent?.n ?? 0) >= RESET_MAX_PER_HOUR) return;

  const { link } = await issueToken(surface, user, "reset", now);
  const rendered = renderPasswordResetEmail({
    surface,
    recipientEmail: user.email,
    dealerName: user.dealerName ?? undefined,
    link,
    validMinutes: RESET_TTL_MS / 60_000,
  });
  await sendEmail({ ...rendered, to: user.email, dealerId: user.dealerId, template: "password_reset" });
}

async function lookupToken(executor: Executor, surface: AuthSurface, purpose: LinkPurpose, token: string, lock: boolean) {
  const users = surface === "dealer" ? dealerUsers : backofficeUsers;
  const query = executor
    .select({
      id: authTokens.id,
      userId: authTokens.userId,
      expiresAt: authTokens.expiresAt,
      usedAt: authTokens.usedAt,
      userEmail: users.email,
      userStatus: users.status,
    })
    .from(authTokens)
    .innerJoin(users, eq(users.id, authTokens.userId))
    .where(
      and(eq(authTokens.tokenHash, hashToken(token)), eq(authTokens.surface, surface), eq(authTokens.purpose, purpose)),
    )
    .limit(1);
  const [row] = lock ? await query.for("update", { of: authTokens }) : await query;
  return row ?? null;
}

function classify(row: Awaited<ReturnType<typeof lookupToken>>, purpose: LinkPurpose, now: Date): LinkTokenState {
  if (!row) return "invalid";
  if (row.usedAt) return "used";
  if (row.expiresAt.getTime() <= now.getTime()) return "expired";
  if (row.userStatus !== REQUIRED_STATUS[purpose]) return "invalid";
  return "valid";
}

export async function inspectLinkToken(
  surface: AuthSurface,
  purpose: LinkPurpose,
  token: string,
  opts: Clock = {},
): Promise<LinkTokenState> {
  if (!token) return "invalid";
  return classify(await lookupToken(db(), surface, purpose, token, false), purpose, opts.now ?? new Date());
}

export type ConsumeLinkResult =
  | { ok: true; sessionToken: string }
  | { ok: false; error: "expired" | "used" | "invalid" | "too_short" };

export async function consumeLinkToken(
  surface: AuthSurface,
  purpose: LinkPurpose,
  token: string,
  newPassword: string,
  meta: { ip?: string | null; userAgent?: string | null; now?: Date },
): Promise<ConsumeLinkResult> {
  if (!token) return { ok: false, error: "invalid" };
  const now = meta.now ?? new Date();
  const users = surface === "dealer" ? dealerUsers : backofficeUsers;
  const sessions = surface === "dealer" ? dealerSessions : backofficeSessions;

  const result = await db().transaction(async (tx): Promise<{ ok: true; userId: string } | Exclude<ConsumeLinkResult, { ok: true }>> => {
    const row = await lookupToken(tx, surface, purpose, token, true);
    const state = classify(row, purpose, now);
    if (state !== "valid" || !row) return { ok: false, error: state === "valid" ? "invalid" : state };
    const invalid = validateNewPassword(newPassword);
    if (invalid) return { ok: false, error: invalid };

    await tx
      .update(users)
      .set({ passwordHash: await hashPassword(newPassword), status: "active", updatedAt: now })
      .where(eq(users.id, row.userId));
    await tx.update(authTokens).set({ usedAt: now }).where(eq(authTokens.id, row.id));
    if (purpose === "reset") await tx.delete(sessions).where(eq(sessions.userId, row.userId));

    const user = await findUser(surface, "id", row.userId, tx);
    await writeAuthAudit(
      {
        surface,
        action: purpose === "invite" ? "auth.invite.accepted" : "auth.password.reset",
        actorId: row.userId,
        dealerId: user?.dealerId,
        email: row.userEmail,
        ip: meta.ip,
      },
      tx,
    );
    return { ok: true, userId: row.userId };
  });

  if (!result.ok) return result;
  // createSession runs its own transaction, so it must start after ours released the user row.
  const sessionToken = await createSession(surface, result.userId, { ip: meta.ip, userAgent: meta.userAgent });
  return { ok: true, sessionToken };
}
