import { pgEnum } from "drizzle-orm/pg-core";

export const dealerStatus = pgEnum("dealer_status", ["active", "suspended", "read_only"]);
export const dealerRole = pgEnum("dealer_role", ["owner", "salesperson"]);
export const backofficeRole = pgEnum("backoffice_role", ["superadmin", "support"]);
export const userStatus = pgEnum("user_status", ["invited", "active", "deactivated"]);
export const authSurface = pgEnum("auth_surface", ["dealer", "backoffice"]);
export const authTokenPurpose = pgEnum("auth_token_purpose", ["invite", "reset"]);
export const carBody = pgEnum("car_body", ["estate", "sedan", "suv"]);
export const messageChannel = pgEnum("message_channel", ["sms", "email"]);
export const messageStatus = pgEnum("message_status", ["queued", "sent", "failed"]);
