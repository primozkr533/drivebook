import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  pgTable,
  text,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { createdAt, tstz, updatedAt } from "./columns";
import { dealers } from "./dealers";
import { backofficeRole, dealerRole, userKind } from "./enums";

export const dealerUsers = pgTable(
  "dealer_users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealerId: uuid("dealer_id")
      .notNull()
      .references(() => dealers.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    name: text("name").notNull(),
    role: dealerRole("role").notNull(),
    passwordHash: text("password_hash"),
    active: boolean("active").notNull().default(true),
    lastLoginAt: tstz("last_login_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("dealer_users_dealer_id_idx").on(t.dealerId),
    uniqueIndex("dealer_users_dealer_id_email_unique").on(t.dealerId, sql`lower(${t.email})`),
  ],
);

export const backofficeUsers = pgTable("backoffice_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  role: backofficeRole("role").notNull(),
  passwordHash: text("password_hash"),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

const exactlyOneUser = (
  kind: AnyPgColumn,
  dealerUserId: AnyPgColumn,
  backofficeUserId: AnyPgColumn,
) =>
  sql`(${kind} = 'dealer' AND ${dealerUserId} IS NOT NULL AND ${backofficeUserId} IS NULL) OR (${kind} = 'backoffice' AND ${backofficeUserId} IS NOT NULL AND ${dealerUserId} IS NULL)`;

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userKind: userKind("user_kind").notNull(),
    dealerUserId: uuid("dealer_user_id").references(() => dealerUsers.id, { onDelete: "cascade" }),
    backofficeUserId: uuid("backoffice_user_id").references(() => backofficeUsers.id, {
      onDelete: "cascade",
    }),
    expiresAt: tstz("expires_at").notNull(),
    lastSeenAt: tstz("last_seen_at").notNull().defaultNow(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
  },
  (t) => [
    index("sessions_dealer_user_id_idx").on(t.dealerUserId),
    index("sessions_backoffice_user_id_idx").on(t.backofficeUserId),
    check("sessions_user_matches_kind", exactlyOneUser(t.userKind, t.dealerUserId, t.backofficeUserId)),
  ],
);

export const invitations = pgTable(
  "invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealerId: uuid("dealer_id")
      .notNull()
      .references(() => dealers.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: dealerRole("role").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    invitedByUserId: uuid("invited_by_user_id").references(() => dealerUsers.id, {
      onDelete: "set null",
    }),
    expiresAt: tstz("expires_at").notNull(),
    acceptedAt: tstz("accepted_at"),
    createdAt: createdAt(),
  },
  (t) => [index("invitations_dealer_id_idx").on(t.dealerId)],
);

export const passwordResets = pgTable(
  "password_resets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userKind: userKind("user_kind").notNull(),
    dealerUserId: uuid("dealer_user_id").references(() => dealerUsers.id, { onDelete: "cascade" }),
    backofficeUserId: uuid("backoffice_user_id").references(() => backofficeUsers.id, {
      onDelete: "cascade",
    }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: tstz("expires_at").notNull(),
    usedAt: tstz("used_at"),
    createdAt: createdAt(),
  },
  (t) => [
    index("password_resets_dealer_user_id_idx").on(t.dealerUserId),
    index("password_resets_backoffice_user_id_idx").on(t.backofficeUserId),
    check(
      "password_resets_user_matches_kind",
      exactlyOneUser(t.userKind, t.dealerUserId, t.backofficeUserId),
    ),
  ],
);
