import { sql } from "drizzle-orm";
import { check, index, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { createdAt, tstz, updatedAt } from "./columns";
import { dealerStatus } from "./enums";
import { plans } from "./plans";

export const dealers = pgTable(
  "dealers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    legalName: text("legal_name").notNull(),
    addressLine: text("address_line").notNull(),
    postalCode: text("postal_code").notNull(),
    city: text("city").notNull(),
    phone: text("phone").notNull(),
    email: text("email").notNull(),
    websiteUrl: text("website_url"),
    mapsUrl: text("maps_url"),
    privacyUrl: text("privacy_url"),
    primaryColor: text("primary_color").notNull(),
    logoKey: text("logo_key"),
    planId: uuid("plan_id")
      .notNull()
      .references(() => plans.id),
    status: dealerStatus("status").notNull().default("active"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("dealers_plan_id_idx").on(t.planId),
    check("dealers_primary_color_hex", sql`${t.primaryColor} ~ '^#[0-9A-Fa-f]{6}$'`),
  ],
);

export const dealerSlugHistory = pgTable(
  "dealer_slug_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealerId: uuid("dealer_id")
      .notNull()
      .references(() => dealers.id, { onDelete: "cascade" }),
    slug: text("slug").notNull().unique(),
    replacedAt: tstz("replaced_at").notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [index("dealer_slug_history_dealer_id_idx").on(t.dealerId)],
);

// The no-overlap rule (EXCLUDE USING gist on dealer_id + tstzrange) cannot be expressed
// in Drizzle; it is added as raw SQL in drizzle/0000_*.sql as dealer_licence_history_no_overlap.
export const dealerLicenceHistory = pgTable(
  "dealer_licence_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealerId: uuid("dealer_id")
      .notNull()
      .references(() => dealers.id, { onDelete: "cascade" }),
    planId: uuid("plan_id")
      .notNull()
      .references(() => plans.id),
    validFrom: tstz("valid_from").notNull(),
    validTo: tstz("valid_to"),
    note: text("note").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("dealer_licence_history_dealer_id_idx").on(t.dealerId),
    check(
      "dealer_licence_history_valid_range",
      sql`${t.validTo} IS NULL OR ${t.validFrom} < ${t.validTo}`,
    ),
  ],
);
