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
import { newPublicId } from "../ids";
import { createdAt, tstz, updatedAt } from "./columns";
import { dealers } from "./dealers";

export const bookingRules = pgTable("booking_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  dealerId: uuid("dealer_id")
    .notNull()
    .unique()
    .references(() => dealers.id, { onDelete: "cascade" }),
  testDriveMinutes: integer("test_drive_minutes").notNull().default(45),
  viewingMinutes: integer("viewing_minutes").notNull().default(30),
  otherMinutes: integer("other_minutes").notNull().default(30),
  capacity: integer("capacity").notNull().default(1),
  // Slot interval: the step between bookable start times.
  slotMinutes: integer("slot_minutes").notNull().default(15),
  // Minimum notice.
  leadTimeMinutes: integer("lead_time_minutes").notNull().default(120),
  // Booking horizon.
  maxDaysAhead: integer("max_days_ahead").notNull().default(14),
  cancelCutoffMinutes: integer("cancel_cutoff_minutes").notNull().default(120),
  bufferMinutes: integer("buffer_minutes").notNull().default(15),
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

export const holidayOverrides = pgTable(
  "holiday_overrides",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealerId: uuid("dealer_id")
      .notNull()
      .references(() => dealers.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    // slovenianWorkFreeDays key; null for dealer-defined days.
    key: text("key"),
    name: text("name").notNull(),
    openAnyway: boolean("open_anyway").notNull().default(false),
    opensAt: time("opens_at"),
    closesAt: time("closes_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("holiday_overrides_dealer_id_idx").on(t.dealerId),
    unique("holiday_overrides_dealer_date_unique").on(t.dealerId, t.date),
    // Optional own hours for the day; both or neither.
    check(
      "holiday_overrides_hours_range",
      sql`(${t.opensAt} IS NULL AND ${t.closesAt} IS NULL) OR (${t.opensAt} IS NOT NULL AND ${t.closesAt} IS NOT NULL AND ${t.opensAt} < ${t.closesAt})`,
    ),
  ],
);

export const dealerClosures = pgTable(
  "dealer_closures",
  {
    id: text("id").primaryKey().$defaultFn(newPublicId),
    dealerId: uuid("dealer_id")
      .notNull()
      .references(() => dealers.id, { onDelete: "cascade" }),
    // Inclusive Europe/Ljubljana calendar days; a single day has start = end.
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    reason: text("reason"),
    createdAt: createdAt(),
  },
  (t) => [
    index("dealer_closures_dealer_id_idx").on(t.dealerId),
    check("dealer_closures_valid_range", sql`${t.endDate} >= ${t.startDate}`),
  ],
);
