import { eq } from "drizzle-orm";
import { auditLog, dealers } from "@/db/schema";
import { DealerReadOnlyError } from "@/server/auth/permissions";
import type { DealerContext } from "./context";
import { db } from "./db";

export type Tx = Parameters<Parameters<ReturnType<typeof db>["transaction"]>[0]>[0];

export type AuditEntry = {
  action: string;
  entity: string;
  entityId?: string;
  actorKind?: string;
  actorId?: string;
  data?: unknown;
};

export async function withDealerMutation<T>(
  ctx: DealerContext,
  fn: (tx: Tx) => Promise<T>,
  audit?: AuditEntry | ((result: T) => AuditEntry),
): Promise<T> {
  return db().transaction(async (tx) => {
    // ctx.status may be stale; FOR SHARE blocks a concurrent status change until this write commits.
    const [dealer] = await tx
      .select({ status: dealers.status })
      .from(dealers)
      .where(eq(dealers.id, ctx.dealerId))
      .for("share");
    if (!dealer) throw new Error(`Dealer ${ctx.dealerId} not found`);
    if (dealer.status === "read_only" || dealer.status === "suspended") throw new DealerReadOnlyError();

    const result = await fn(tx);
    const entry = typeof audit === "function" ? audit(result) : audit;
    if (entry) {
      await tx.insert(auditLog).values({
        dealerId: ctx.dealerId,
        actorKind: entry.actorKind ?? "system",
        actorId: entry.actorId ?? null,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId ?? null,
        data: entry.data ?? {},
      });
    }
    return result;
  });
}
