import { and, eq, gt, ne } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { getConfig } from "@/lib/config";
import { backofficeSessions, backofficeUsers, dealers, dealerSessions, dealerUsers } from "@/db/schema";
import { createDealerContext, type DealerContext } from "@/server/data/context";
import { db } from "@/server/data/db";
import { sessionCookieSecure } from "@/server/routing";
import { hashToken, newOpaqueToken } from "./tokens";

export type AuthSurface = "dealer" | "backoffice";

export const SESSION_COOKIE = { dealer: "db_app_session", backoffice: "db_admin_session" } as const;

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const SESSION_REFRESH_AFTER_MS = 60 * 60 * 1000;

// Host-only on purpose: no `domain`, so an app. cookie is never sent to admin. or a dealer subdomain.
export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  path: "/",
  maxAge: SESSION_TTL_MS / 1000,
} as const;

const tables = {
  dealer: { sessions: dealerSessions, users: dealerUsers },
  backoffice: { sessions: backofficeSessions, users: backofficeUsers },
} as const;

export type Session = {
  id: string;
  userId: string;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
  ip: string | null;
  userAgent: string | null;
  // True when this validation slid the expiry; the caller should re-set the cookie.
  refreshed: boolean;
};

export type SessionUser = { id: string; email: string; name: string; role: string; status: string };

export type DealerSessionUser = SessionUser & { role: "owner" | "salesperson"; dealerId: string };
export type BackofficeSessionUser = SessionUser & { role: "superadmin" | "support" };

type SurfaceUser<S extends AuthSurface> = S extends "dealer" ? DealerSessionUser : BackofficeSessionUser;

export type ValidatedSession<S extends AuthSurface> = { session: Session; user: SurfaceUser<S> };

export async function createSession(
  surface: AuthSurface,
  userId: string,
  meta: { ip?: string | null; userAgent?: string | null },
): Promise<string> {
  const { sessions, users } = tables[surface];
  const token = newOpaqueToken();
  const now = new Date();
  await db().transaction(async (tx) => {
    await tx.insert(sessions).values({
      tokenHash: hashToken(token),
      userId,
      lastSeenAt: now,
      expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
      ip: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    });
    await tx.update(users).set({ lastLoginAt: now }).where(eq(users.id, userId));
  });
  return token;
}

export type SessionCookieOverride = { secure?: boolean };

async function cookieOptions(override: SessionCookieOverride = {}) {
  let secure = override.secure;
  if (secure === undefined) {
    try {
      secure = sessionCookieSecure(await headers(), getConfig().devAliases);
    } catch {
      secure = true;
    }
  }
  return secure ? SESSION_COOKIE_OPTIONS : { ...SESSION_COOKIE_OPTIONS, secure: false };
}

export async function setSessionCookie(
  surface: AuthSurface,
  token: string,
  override?: SessionCookieOverride,
): Promise<void> {
  (await cookies()).set(SESSION_COOKIE[surface], token, await cookieOptions(override));
}

export async function clearSessionCookie(surface: AuthSurface): Promise<void> {
  (await cookies()).set(SESSION_COOKIE[surface], "", { ...(await cookieOptions()), maxAge: 0 });
}

export async function validateSessionToken<S extends AuthSurface>(
  surface: S,
  token: string,
): Promise<ValidatedSession<S> | null> {
  if (!token) return null;
  const now = new Date();
  const user = surface === "dealer" ? await findDealerSession(token, now) : await findBackofficeSession(token, now);
  if (!user) return null;
  const { row, user: u } = user;
  if (u.status !== "active") return null;

  const session: Session = { ...row, refreshed: false };
  if (now.getTime() - row.lastSeenAt.getTime() > SESSION_REFRESH_AFTER_MS) {
    const { sessions } = tables[surface];
    const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
    await db().update(sessions).set({ lastSeenAt: now, expiresAt }).where(eq(sessions.id, row.id));
    Object.assign(session, { lastSeenAt: now, expiresAt, refreshed: true });
  }
  return { session, user: u as SurfaceUser<S> };
}

const sessionFields = (s: typeof dealerSessions | typeof backofficeSessions) => ({
  id: s.id,
  userId: s.userId,
  createdAt: s.createdAt,
  lastSeenAt: s.lastSeenAt,
  expiresAt: s.expiresAt,
  ip: s.ip,
  userAgent: s.userAgent,
});

async function findDealerSession(token: string, now: Date) {
  const [found] = await db()
    .select({
      row: sessionFields(dealerSessions),
      user: {
        id: dealerUsers.id,
        email: dealerUsers.email,
        name: dealerUsers.name,
        role: dealerUsers.role,
        status: dealerUsers.status,
        dealerId: dealerUsers.dealerId,
      },
    })
    .from(dealerSessions)
    .innerJoin(dealerUsers, eq(dealerUsers.id, dealerSessions.userId))
    .where(and(eq(dealerSessions.tokenHash, hashToken(token)), gt(dealerSessions.expiresAt, now)))
    .limit(1);
  return found;
}

async function findBackofficeSession(token: string, now: Date) {
  const [found] = await db()
    .select({
      row: sessionFields(backofficeSessions),
      user: {
        id: backofficeUsers.id,
        email: backofficeUsers.email,
        name: backofficeUsers.name,
        role: backofficeUsers.role,
        status: backofficeUsers.status,
      },
    })
    .from(backofficeSessions)
    .innerJoin(backofficeUsers, eq(backofficeUsers.id, backofficeSessions.userId))
    .where(and(eq(backofficeSessions.tokenHash, hashToken(token)), gt(backofficeSessions.expiresAt, now)))
    .limit(1);
  return found;
}

export async function getCurrentSession<S extends AuthSurface>(surface: S): Promise<ValidatedSession<S> | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE[surface])?.value;
  if (!token) return null;
  const result = await validateSessionToken(surface, token);
  if (result?.session.refreshed) {
    try {
      store.set(SESSION_COOKIE[surface], token, await cookieOptions());
    } catch {
      // Server Components cannot set cookies; the next action or route handler will.
    }
  }
  return result;
}

export async function destroyCurrentSession(surface: AuthSurface): Promise<void> {
  const token = (await cookies()).get(SESSION_COOKIE[surface])?.value;
  if (token) {
    const { sessions } = tables[surface];
    await db().delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
  }
  await clearSessionCookie(surface);
}

export async function revokeUserSessions(
  surface: AuthSurface,
  userId: string,
  opts: { exceptSessionId?: string } = {},
): Promise<void> {
  const { sessions } = tables[surface];
  const where = opts.exceptSessionId
    ? and(eq(sessions.userId, userId), ne(sessions.id, opts.exceptSessionId))
    : eq(sessions.userId, userId);
  await db().delete(sessions).where(where);
}

export async function deactivateUser(surface: AuthSurface, userId: string): Promise<void> {
  const { sessions, users } = tables[surface];
  await db().transaction(async (tx) => {
    await tx.update(users).set({ status: "deactivated" }).where(eq(users.id, userId));
    await tx.delete(sessions).where(eq(sessions.userId, userId));
  });
}

export type DealerSession = {
  ctx: DealerContext;
  user: { id: string; email: string; role: DealerSessionUser["role"] };
  sessionId: string;
};

// The authenticated-session path for building a DealerContext (tenant rule 2).
export async function getDealerContextFromSession(): Promise<DealerSession | null> {
  const current = await getCurrentSession("dealer");
  if (!current) return null;
  const [dealer] = await db()
    .select({ id: dealers.id, slug: dealers.slug, status: dealers.status })
    .from(dealers)
    .where(eq(dealers.id, current.user.dealerId))
    .limit(1);
  if (!dealer) return null;
  const { id, email, role } = current.user;
  return { ctx: createDealerContext(dealer), user: { id, email, role }, sessionId: current.session.id };
}
