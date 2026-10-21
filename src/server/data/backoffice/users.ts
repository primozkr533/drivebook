import { asc, eq } from "drizzle-orm";
import { backofficeUsers } from "@/db/schema";
import { createInvitation } from "@/server/auth/links";
import { requireBackofficeRole, type BackofficeRole } from "@/server/auth/permissions";
import { normalizeEmail } from "@/server/auth/rate-limit";
import { deactivateUser } from "@/server/auth/session";
import { db } from "../db";
import { withBackofficeMutation } from "./mutate";

export type BackofficeUserStatus = "invited" | "active" | "deactivated";

export type BackofficeUserListItem = {
  id: string;
  email: string;
  role: BackofficeRole;
  status: BackofficeUserStatus;
  createdAt: Date;
  lastLoginAt: Date | null;
};

export type InviteBackofficeUserResult =
  | { ok: true; userId: string; link: string }
  | { ok: false; error: "email" | "taken" };

export type DeactivateBackofficeUserResult = { ok: true } | { ok: false; error: "self" | "not_found" };

// Thrown inside the mutation so a rejected request rolls back its audit row too.
class Rejected extends Error {}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isUniqueViolation = (error: unknown): boolean =>
  error instanceof Error &&
  ((error as { code?: string }).code === "23505" || (error.cause as { code?: string } | undefined)?.code === "23505");

export async function listBackofficeUsers(): Promise<BackofficeUserListItem[]> {
  await requireBackofficeRole(["superadmin", "support"]);
  return db()
    .select({
      id: backofficeUsers.id,
      email: backofficeUsers.email,
      role: backofficeUsers.role,
      status: backofficeUsers.status,
      createdAt: backofficeUsers.createdAt,
      lastLoginAt: backofficeUsers.lastLoginAt,
    })
    .from(backofficeUsers)
    .orderBy(asc(backofficeUsers.email));
}

export async function inviteBackofficeUser(input: {
  email: string;
  role: "superadmin" | "support";
}): Promise<InviteBackofficeUserResult> {
  await requireBackofficeRole(["superadmin"]);
  const email = normalizeEmail(input.email);
  const role = input.role;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "email" };

  let userId: string;
  try {
    userId = await withBackofficeMutation(
      async (tx) => {
        const [existing] = await tx
          .select({ id: backofficeUsers.id })
          .from(backofficeUsers)
          .where(eq(backofficeUsers.email, email))
          .limit(1);
        if (existing) throw new Rejected();
        const [created] = await tx
          .insert(backofficeUsers)
          .values({ email, name: email.split("@")[0], role, status: "invited" })
          .returning({ id: backofficeUsers.id });
        return created.id;
      },
      (id) => ({ action: "backoffice_user.invite", entity: "backoffice_user", entityId: id, details: { email, role } }),
    );
  } catch (error) {
    if (error instanceof Rejected || isUniqueViolation(error)) return { ok: false, error: "taken" };
    throw error;
  }

  // Only after the commit, so no invitation is ever sent for a rolled-back user.
  const { link } = await createInvitation("backoffice", userId);
  return { ok: true, userId, link };
}

export async function deactivateBackofficeUser(userId: string): Promise<DeactivateBackofficeUserResult> {
  const actor = await requireBackofficeRole(["superadmin"]);
  if (userId === actor.userId) return { ok: false, error: "self" };
  if (!UUID_RE.test(userId)) return { ok: false, error: "not_found" };

  try {
    await withBackofficeMutation(
      async (tx) => {
        const [target] = await tx
          .select({ status: backofficeUsers.status })
          .from(backofficeUsers)
          .where(eq(backofficeUsers.id, userId))
          .limit(1);
        if (!target) throw new Rejected();
        await deactivateUser("backoffice", userId, tx);
        return target.status;
      },
      (previousStatus) => ({
        action: "backoffice_user.deactivate",
        entity: "backoffice_user",
        entityId: userId,
        details: { before: { status: previousStatus }, after: { status: "deactivated" } },
      }),
    );
  } catch (error) {
    if (error instanceof Rejected) return { ok: false, error: "not_found" };
    throw error;
  }
  return { ok: true };
}
