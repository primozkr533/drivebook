import { boolean, index, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { createdAt, tstz } from "./columns";
import { authSurface, authTokenPurpose } from "./enums";
import { backofficeUsers, dealerUsers } from "./users";

// A factory, not a shared object: column builders are bound to the first table that uses them.
const sessionColumns = () => ({
  id: uuid("id").primaryKey().defaultRandom(),
  // sha256 hex of the cookie token; the raw token is never stored.
  tokenHash: text("token_hash").notNull().unique(),
  createdAt: createdAt(),
  lastSeenAt: tstz("last_seen_at").notNull().defaultNow(),
  expiresAt: tstz("expires_at").notNull(),
  ip: text("ip"),
  userAgent: text("user_agent"),
});

// One table per surface so a dealer token can never validate as a backoffice session.
export const dealerSessions = pgTable(
  "dealer_sessions",
  {
    ...sessionColumns(),
    userId: uuid("user_id")
      .notNull()
      .references(() => dealerUsers.id, { onDelete: "cascade" }),
  },
  (t) => [index("dealer_sessions_user_id_idx").on(t.userId)],
);

export const backofficeSessions = pgTable(
  "backoffice_sessions",
  {
    ...sessionColumns(),
    userId: uuid("user_id")
      .notNull()
      .references(() => backofficeUsers.id, { onDelete: "cascade" }),
  },
  (t) => [index("backoffice_sessions_user_id_idx").on(t.userId)],
);

export const authTokens = pgTable(
  "auth_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    surface: authSurface("surface").notNull(),
    // Not a FK: it points at dealer_users or backoffice_users depending on surface.
    userId: uuid("user_id").notNull(),
    purpose: authTokenPurpose("purpose").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: tstz("expires_at").notNull(),
    usedAt: tstz("used_at"),
    createdAt: createdAt(),
  },
  (t) => [index("auth_tokens_surface_user_id_idx").on(t.surface, t.userId)],
);

export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    surface: authSurface("surface").notNull(),
    email: text("email").notNull(),
    ip: text("ip"),
    success: boolean("success").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("login_attempts_surface_email_created_at_idx").on(t.surface, t.email, t.createdAt),
    index("login_attempts_surface_ip_created_at_idx").on(t.surface, t.ip, t.createdAt),
  ],
);

export const passwordResetRequests = pgTable(
  "password_reset_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    surface: authSurface("surface").notNull(),
    ip: text("ip").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("password_reset_requests_surface_ip_created_at_idx").on(t.surface, t.ip, t.createdAt)],
);
