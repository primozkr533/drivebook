import { sql } from "drizzle-orm";
import { check, index, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { createdAt, tstz, updatedAt } from "./columns";
import { dealers } from "./dealers";
import { backofficeRole, dealerRole, userStatus } from "./enums";

export const dealerUsers = pgTable(
  "dealer_users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealerId: uuid("dealer_id")
      .notNull()
      .references(() => dealers.id, { onDelete: "cascade" }),
    // Unique across dealers: the app. login form asks only for an email.
    email: text("email").notNull().unique(),
    name: text("name").notNull(),
    role: dealerRole("role").notNull(),
    // Null until the invitation is accepted.
    passwordHash: text("password_hash"),
    status: userStatus("status").notNull().default("invited"),
    totpSecretEnc: text("totp_secret_enc"),
    totpEnabledAt: tstz("totp_enabled_at"),
    lastLoginAt: tstz("last_login_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("dealer_users_dealer_id_idx").on(t.dealerId),
    check("dealer_users_email_lowercase", sql`${t.email} = lower(${t.email})`),
  ],
);

export const backofficeUsers = pgTable(
  "backoffice_users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull().unique(),
    name: text("name").notNull(),
    role: backofficeRole("role").notNull(),
    passwordHash: text("password_hash"),
    status: userStatus("status").notNull().default("invited"),
    totpSecretEnc: text("totp_secret_enc"),
    totpEnabledAt: tstz("totp_enabled_at"),
    lastLoginAt: tstz("last_login_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [check("backoffice_users_email_lowercase", sql`${t.email} = lower(${t.email})`)],
);
