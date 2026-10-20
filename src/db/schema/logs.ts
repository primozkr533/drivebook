import { index, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { createdAt, updatedAt } from "./columns";
import { dealers } from "./dealers";
import { messageChannel, messageStatus } from "./enums";

export const messageLog = pgTable(
  "message_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Logs outlive the dealer row so deliveries stay auditable.
    dealerId: uuid("dealer_id").references(() => dealers.id, { onDelete: "set null" }),
    channel: messageChannel("channel").notNull(),
    provider: text("provider").notNull(),
    recipient: text("recipient").notNull(),
    template: text("template").notNull(),
    status: messageStatus("status").notNull().default("queued"),
    providerMessageId: text("provider_message_id"),
    error: text("error"),
    payload: jsonb("payload").notNull().default({}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("message_log_dealer_id_idx").on(t.dealerId)],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealerId: uuid("dealer_id").references(() => dealers.id, { onDelete: "set null" }),
    actorKind: text("actor_kind").notNull(),
    actorId: text("actor_id"),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    data: jsonb("data").notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("audit_log_dealer_id_idx").on(t.dealerId)],
);
