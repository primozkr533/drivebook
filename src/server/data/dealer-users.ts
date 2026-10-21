import { and, asc, count, eq, inArray, isNull, sql } from "drizzle-orm";
import { authTokens, dealerUsers, dealers, plans } from "@/db/schema";
import { createInvitation } from "@/server/auth/links";
import { requireDealerRole, type DealerActor, type DealerRole } from "@/server/auth/permissions";
import { normalizeEmail } from "@/server/auth/rate-limit";
import { deactivateUser } from "@/server/auth/session";
import type { DealerContext } from "./context";
import { db } from "./db";
import { withDealerMutation, type AuditEntry, type Tx } from "./mutate";

export type DealerUserStatus = "invited" | "active" | "deactivated";

export type DealerUserListItem = {
  id: string;
  name: string;
  email: string;
  role: DealerRole;
  status: DealerUserStatus;
  lastLoginAt: Date | null;
};

export type DealerUserList = { users: DealerUserListItem[]; maxUsers: number | null; used: number };

export type InviteDealerUserResult =
  | { ok: true; userId: string; link: string }
  | { ok: false; error: "email" | "name" | "role" | "taken" | "limit_reached" };

export type ChangeDealerUserRoleResult = { ok: true } | { ok: false; error: "role" | "not_found" | "last_owner" };

export type DeactivateDealerUserResult = { ok: true } | { ok: false; error: "not_found" | "last_owner" };

export type ReactivateDealerUserResult =
  | { ok: true; status: "active" | "invited" }
  | { ok: false; error: "not_found" | "not_deactivated" | "limit_reached" };

// Thrown inside the mutation so a rejected request rolls back its audit row too.
class Rejected<E extends string> extends Error {
  constructor(readonly code: E) {
    super(code);
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLES: readonly DealerRole[] = ["owner", "salesperson"];

const isUniqueViolation = (error: unknown): boolean =>
  error instanceof Error &&
  ((error as { code?: string }).code === "23505" || (error.cause as { code?: string } | undefined)?.code === "23505");

const audit = (actor: DealerActor, entry: Omit<AuditEntry, "actorKind" | "actorId" | "entity">): AuditEntry => ({
  ...entry,
  entity: "dealer_user",
  actorKind: "dealer_user",
  actorId: actor.userId,
});

// Serializes user-management writes per dealer so concurrent requests can't both pass the
// plan-limit or last-Owner check.
async function lockDealerUsers(tx: Tx, ctx: DealerContext): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`dealer_users:${ctx.dealerId}`}, 0))`);
}

async function usage(executor: Tx | ReturnType<typeof db>, ctx: DealerContext) {
  const [plan] = await executor
    .select({ maxUsers: plans.maxUsers })
    .from(dealers)
    .innerJoin(plans, eq(plans.id, dealers.planId))
    .where(eq(dealers.id, ctx.dealerId))
    .limit(1);
  const [{ used }] = await executor
    .select({ used: count() })
    .from(dealerUsers)
    .where(and(eq(dealerUsers.dealerId, ctx.dealerId), inArray(dealerUsers.status, ["invited", "active"])));
  return { maxUsers: plan?.maxUsers ?? null, used };
}

const limitReached = ({ maxUsers, used }: { maxUsers: number | null; used: number }) =>
  maxUsers !== null && used >= maxUsers;

async function findTarget(tx: Tx, ctx: DealerContext, userId: string) {
  const [target] = await tx
    .select({
      id: dealerUsers.id,
      role: dealerUsers.role,
      status: dealerUsers.status,
      hasPassword: sql<boolean>`${dealerUsers.passwordHash} is not null`,
    })
    .from(dealerUsers)
    .where(and(eq(dealerUsers.id, userId), eq(dealerUsers.dealerId, ctx.dealerId)))
    .limit(1);
  if (!target) throw new Rejected("not_found");
  return target;
}

async function isOnlyActiveOwner(tx: Tx, ctx: DealerContext, target: { role: DealerRole; status: string }) {
  if (target.role !== "owner" || target.status !== "active") return false;
  const [{ owners }] = await tx
    .select({ owners: count() })
    .from(dealerUsers)
    .where(
      and(eq(dealerUsers.dealerId, ctx.dealerId), eq(dealerUsers.role, "owner"), eq(dealerUsers.status, "active")),
    );
  return owners <= 1;
}

async function runRejectable<T, E extends string>(fn: () => Promise<T>): Promise<T | { ok: false; error: E }> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof Rejected) return { ok: false, error: error.code as E };
    throw error;
  }
}

export async function listDealerUsers(ctx: DealerContext): Promise<DealerUserList> {
  await requireDealerRole(ctx, ["owner"]);
  const users = await db()
    .select({
      id: dealerUsers.id,
      name: dealerUsers.name,
      email: dealerUsers.email,
      role: dealerUsers.role,
      status: dealerUsers.status,
      lastLoginAt: dealerUsers.lastLoginAt,
    })
    .from(dealerUsers)
    .where(eq(dealerUsers.dealerId, ctx.dealerId))
    .orderBy(asc(dealerUsers.name), asc(dealerUsers.email));
  return { users, ...(await usage(db(), ctx)) };
}

export async function inviteDealerUser(
  ctx: DealerContext,
  input: { email: string; name: string; role: DealerRole },
): Promise<InviteDealerUserResult> {
  const actor = await requireDealerRole(ctx, ["owner"]);
  const email = normalizeEmail(input.email);
  const name = input.name.trim();
  const role = input.role;
  if (!EMAIL_RE.test(email)) return { ok: false, error: "email" };
  if (name.length < 1 || name.length > 100) return { ok: false, error: "name" };
  if (!ROLES.includes(role)) return { ok: false, error: "role" };

  let userId: string;
  try {
    ({ userId } = await withDealerMutation(
      ctx,
      async (tx) => {
        await lockDealerUsers(tx, ctx);
        const [existing] = await tx
          .select({
            id: dealerUsers.id,
            dealerId: dealerUsers.dealerId,
            role: dealerUsers.role,
            status: dealerUsers.status,
          })
          .from(dealerUsers)
          .where(eq(dealerUsers.email, email))
          .limit(1);
        // E-mails are unique across dealers, so another dealer's user (even deactivated) is also taken.
        if (existing && (existing.dealerId !== ctx.dealerId || existing.status !== "deactivated")) {
          throw new Rejected("taken");
        }
        if (limitReached(await usage(tx, ctx))) throw new Rejected("limit_reached");
        if (!existing) {
          const [created] = await tx
            .insert(dealerUsers)
            .values({ dealerId: ctx.dealerId, email, name, role, status: "invited" })
            .returning({ id: dealerUsers.id });
          return { userId: created.id, previous: null };
        }
        // A returning member starts over like a fresh invite: no old password, 2FA device or open links.
        const now = new Date();
        await tx
          .update(dealerUsers)
          .set({
            name,
            role,
            status: "invited",
            passwordHash: null,
            totpSecretEnc: null,
            totpEnabledAt: null,
            totpLastStep: null,
            updatedAt: now,
          })
          .where(and(eq(dealerUsers.id, existing.id), eq(dealerUsers.dealerId, ctx.dealerId)));
        await tx
          .update(authTokens)
          .set({ usedAt: now })
          .where(and(eq(authTokens.surface, "dealer"), eq(authTokens.userId, existing.id), isNull(authTokens.usedAt)));
        return { userId: existing.id, previous: { role: existing.role, status: existing.status } };
      },
      ({ userId: id, previous }) =>
        previous
          ? audit(actor, {
              action: "dealer_user.reinvite",
              entityId: id,
              data: { email, name, before: previous, after: { role, status: "invited" } },
            })
          : audit(actor, { action: "dealer_user.invite", entityId: id, data: { email, name, role } }),
    ));
  } catch (error) {
    if (error instanceof Rejected) return { ok: false, error: error.code };
    if (isUniqueViolation(error)) return { ok: false, error: "taken" };
    throw error;
  }

  // Only after the commit, so no invitation is ever sent for a rolled-back user.
  const { link } = await createInvitation("dealer", userId);
  return { ok: true, userId, link };
}

export async function changeDealerUserRole(
  ctx: DealerContext,
  userId: string,
  role: DealerRole,
): Promise<ChangeDealerUserRoleResult> {
  const actor = await requireDealerRole(ctx, ["owner"]);
  if (!ROLES.includes(role)) return { ok: false, error: "role" };
  if (!UUID_RE.test(userId)) return { ok: false, error: "not_found" };

  return runRejectable(async () => {
    await withDealerMutation(
      ctx,
      async (tx) => {
        await lockDealerUsers(tx, ctx);
        const target = await findTarget(tx, ctx, userId);
        if (role !== "owner" && (await isOnlyActiveOwner(tx, ctx, target))) throw new Rejected("last_owner");
        await tx
          .update(dealerUsers)
          .set({ role, updatedAt: new Date() })
          .where(and(eq(dealerUsers.id, userId), eq(dealerUsers.dealerId, ctx.dealerId)));
        return target.role;
      },
      (previousRole) =>
        audit(actor, {
          action: "dealer_user.change_role",
          entityId: userId,
          data: { before: { role: previousRole }, after: { role } },
        }),
    );
    return { ok: true as const };
  });
}

export async function deactivateDealerUser(ctx: DealerContext, userId: string): Promise<DeactivateDealerUserResult> {
  const actor = await requireDealerRole(ctx, ["owner"]);
  if (!UUID_RE.test(userId)) return { ok: false, error: "not_found" };

  return runRejectable(async () => {
    await withDealerMutation(
      ctx,
      async (tx) => {
        await lockDealerUsers(tx, ctx);
        const target = await findTarget(tx, ctx, userId);
        if (await isOnlyActiveOwner(tx, ctx, target)) throw new Rejected("last_owner");
        await deactivateUser("dealer", userId, tx);
        return target.status;
      },
      (previousStatus) =>
        audit(actor, {
          action: "dealer_user.deactivate",
          entityId: userId,
          data: { before: { status: previousStatus }, after: { status: "deactivated" } },
        }),
    );
    return { ok: true as const };
  });
}

export async function reactivateDealerUser(ctx: DealerContext, userId: string): Promise<ReactivateDealerUserResult> {
  const actor = await requireDealerRole(ctx, ["owner"]);
  if (!UUID_RE.test(userId)) return { ok: false, error: "not_found" };

  const result = await runRejectable<{ status: "active" | "invited" }, "not_found" | "not_deactivated" | "limit_reached">(
    () =>
      withDealerMutation(
        ctx,
        async (tx) => {
          await lockDealerUsers(tx, ctx);
          const target = await findTarget(tx, ctx, userId);
          if (target.status !== "deactivated") throw new Rejected("not_deactivated");
          if (limitReached(await usage(tx, ctx))) throw new Rejected("limit_reached");
          const status = target.hasPassword ? ("active" as const) : ("invited" as const);
          await tx
            .update(dealerUsers)
            .set({ status, updatedAt: new Date() })
            .where(and(eq(dealerUsers.id, userId), eq(dealerUsers.dealerId, ctx.dealerId)));
          return { status };
        },
        ({ status }) =>
          audit(actor, {
            action: "dealer_user.reactivate",
            entityId: userId,
            data: { before: { status: "deactivated" }, after: { status } },
          }),
      ),
  );
  if ("ok" in result) return result;

  // A user who never set a password can only come back through a fresh invitation link.
  if (result.status === "invited") await createInvitation("dealer", userId);
  return { ok: true, status: result.status };
}
