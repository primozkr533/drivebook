import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { DealerContext } from "@/server/data/context";
import { BASE_PATH_HEADER } from "@/server/routing";
import { getCurrentSession, getDealerContextFromSession, type DealerSession } from "./session";

export type DealerRole = "owner" | "salesperson";
export type BackofficeRole = "superadmin" | "support";

export type DealerActor = { userId: string; role: DealerRole; dealerId: string };
export type BackofficeActor = { userId: string; role: BackofficeRole };

export type BackofficeUser = { id: string; email: string; role: BackofficeRole };

export class NotAuthenticatedError extends Error {
  constructor(message = "Not authenticated") {
    super(message);
    this.name = "NotAuthenticatedError";
  }
}

export class ForbiddenError extends Error {
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class DealerReadOnlyError extends Error {
  constructor(message = "Dealer is read-only") {
    super(message);
    this.name = "DealerReadOnlyError";
  }
}

export async function getSurfaceBasePath(): Promise<string> {
  return (await headers()).get(BASE_PATH_HEADER) ?? "";
}

async function redirectToLogin(): Promise<never> {
  redirect(`${await getSurfaceBasePath()}/login`);
}

export async function requireDealerUser(): Promise<DealerSession> {
  const current = await getDealerContextFromSession();
  if (!current) return redirectToLogin();
  return current;
}

// The role always comes from the session, never from the caller.
export async function requireDealerRole(ctx: DealerContext, allowed: DealerRole[]): Promise<DealerActor> {
  const { ctx: sessionCtx, user } = await requireDealerUser();
  if (sessionCtx.dealerId !== ctx.dealerId || !allowed.includes(user.role)) throw new ForbiddenError();
  return { userId: user.id, role: user.role, dealerId: sessionCtx.dealerId };
}

export async function requireBackofficeUser(): Promise<{ user: BackofficeUser }> {
  const current = await getCurrentSession("backoffice");
  if (!current) return redirectToLogin();
  const { id, email, role } = current.user;
  return { user: { id, email, role } };
}

export async function requireBackofficeRole(allowed: BackofficeRole[]): Promise<BackofficeActor> {
  const { user } = await requireBackofficeUser();
  if (!allowed.includes(user.role)) throw new ForbiddenError();
  return { userId: user.id, role: user.role };
}
