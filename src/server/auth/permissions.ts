import type { DealerContext } from "@/server/data/context";

export type DealerRole = "owner" | "manager" | "salesperson";
export type BackofficeRole = "superadmin" | "support";

export type DealerActor = { userId: string; role: DealerRole; dealerId: string };
export type BackofficeActor = { userId: string; role: BackofficeRole };

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

const dealerRoleRank: Record<DealerRole, number> = { salesperson: 0, manager: 1, owner: 2 };

export function dealerRoleSatisfies(role: DealerRole, allowed: readonly DealerRole[]): boolean {
  return allowed.some((a) => dealerRoleRank[role] >= dealerRoleRank[a]);
}

// Stubs until the auth stage adds sessions; signatures must stay stable for callers.
export async function requireDealerRole(_ctx: DealerContext, _allowed: DealerRole[]): Promise<DealerActor> {
  throw new NotAuthenticatedError();
}

export async function requireBackofficeRole(_allowed: BackofficeRole[]): Promise<BackofficeActor> {
  throw new NotAuthenticatedError();
}
