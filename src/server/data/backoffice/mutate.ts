import { auditLog } from "@/db/schema";
import { requireBackofficeRole, type BackofficeActor } from "@/server/auth/permissions";
import { db } from "../db";
import type { Tx } from "../mutate";

export type BackofficeAuditEntry = {
  action: string;
  entity: string;
  entityId?: string;
  dealerId?: string | null;
  details?: unknown;
};

// Not routed through withDealerMutation: the operator must be able to manage and reactivate
// read_only/suspended dealers.
export async function withBackofficeMutation<T>(
  fn: (tx: Tx, actor: BackofficeActor) => Promise<T>,
  audit: BackofficeAuditEntry | ((result: T) => BackofficeAuditEntry),
): Promise<T> {
  const actor = await requireBackofficeRole(["superadmin"]);
  return db().transaction(async (tx) => {
    const result = await fn(tx, actor);
    const entry = typeof audit === "function" ? audit(result) : audit;
    await tx.insert(auditLog).values({
      dealerId: entry.dealerId ?? null,
      actorKind: "backoffice_user",
      actorId: actor.userId,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId ?? null,
      data: entry.details ?? {},
    });
    return result;
  });
}
