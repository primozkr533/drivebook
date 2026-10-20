import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  smallint,
  text,
  time,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, tstz, updatedAt } from "./columns";
import { dealers } from "./dealers";

export const bookingRules = pgTable("booking_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  dealerId: uuid("dealer_id")
    .notNull()
    .unique()
    .references(() => dealers.id, { onDelete: "cascade" }),
  slotMinutes: integer("slot_minutes").notNull().default(30),
  leadTimeMinutes: integer("lead_time_minutes").notNull().default(120),
  maxDaysAhead: integer("max_days_ahead").notNull().default(30),
  cancelCutoffMinutes: integer("cancel_cutoff_minutes").notNull().default(120),
  bufferMinutes: integer("buffer_minutes").notNull().default(0),
  requirePhoneVerification: boolean("require_phone_verification").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const openingHours = pgTable(
  "opening_hours",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealerId: uuid("dealer_id")
      .notNull()
      .references(() => dealers.id, { onDelete: "cascade" }),
    isoWeekday: smallint("iso_weekday").notNull(),
    opensAt: time("opens_at").notNull(),
    closesAt: time("closes_at").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("opening_hours_dealer_id_idx").on(t.dealerId),
    unique("opening_hours_dealer_weekday_opens_unique").on(t.dealerId, t.isoWeekday, t.opensAt),
    check("opening_hours_iso_weekday_range", sql`${t.isoWeekday} BETWEEN 1 AND 7`),
    check("opening_hours_opens_before_closes", sql`${t.opensAt} < ${t.closesAt}`),
  ],
);

export const closures = pgTable(
  "closures",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealerId: uuid("dealer_id")
      .notNull()
      .references(() => dealers.id, { onDelete: "cascade" }),
    startsAt: tstz("starts_at").notNull(),
    endsAt: tstz("ends_at").notNull(),
    reason: text("reason").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("closures_dealer_id_idx").on(t.dealerId),
    check("closures_valid_range", sql`${t.startsAt} < ${t.endsAt}`),
  ],
);

export const holidayOverrides = pgTable(
  "holiday_overrides",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealerId: uuid("dealer_id")
      .notNull()
      .references(() => dealers.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    name: text("name").notNull(),
    isOpen: boolean("is_open").notNull(),
    opensAt: time("opens_at"),
    closesAt: time("closes_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("holiday_overrides_dealer_id_idx").on(t.dealerId),
    unique("holiday_overrides_dealer_date_unique").on(t.dealerId, t.date),
    check(
      "holiday_overrides_open_hours",
      sql`NOT ${t.isOpen} OR (${t.opensAt} IS NOT NULL AND ${t.closesAt} IS NOT NULL AND ${t.opensAt} < ${t.closesAt})`,
    ),
  ],
);
