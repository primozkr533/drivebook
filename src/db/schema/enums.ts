import { pgEnum } from "drizzle-orm/pg-core";

export const dealerStatus = pgEnum("dealer_status", ["active", "suspended", "read_only"]);
export const dealerRole = pgEnum("dealer_role", ["owner", "manager", "salesperson"]);
export const backofficeRole = pgEnum("backoffice_role", ["superadmin", "support"]);
export const userKind = pgEnum("user_kind", ["dealer", "backoffice"]);
export const carBody = pgEnum("car_body", ["estate", "sedan", "suv"]);
export const messageChannel = pgEnum("message_channel", ["sms", "email"]);
export const messageStatus = pgEnum("message_status", ["queued", "sent", "failed", "mocked"]);
