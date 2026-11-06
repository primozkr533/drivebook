import { sql } from "drizzle-orm";
import { boolean, check, index, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { newPublicId } from "../ids";
import { createdAt, tstz, updatedAt } from "./columns";
import { cars } from "./cars";
import { dealers } from "./dealers";
import { bookingKind, bookingStatus } from "./enums";

// One booking occupies one car; each car has its own calendar inside the dealer's shared opening hours.
export const bookings = pgTable(
  "bookings",
  {
    // Public in the confirmation URL, so unguessable.
    id: text("id").primaryKey().$defaultFn(newPublicId),
    dealerId: uuid("dealer_id")
      .notNull()
      .references(() => dealers.id, { onDelete: "cascade" }),
    // no action (checked at statement end, so a dealer cascade still works): a booked car can be hidden, not deleted.
    carId: text("car_id")
      .notNull()
      .references(() => cars.id, { onDelete: "no action" }),
    kind: bookingKind("kind").notNull(),
    status: bookingStatus("status").notNull().default("confirmed"),
    startsAt: tstz("starts_at").notNull(),
    endsAt: tstz("ends_at").notNull(),
    customerName: text("customer_name").notNull(),
    customerPhone: text("customer_phone").notNull(),
    customerEmail: text("customer_email"),
    customerNote: text("customer_note"),
    // Short human code printed on the ticket.
    code: text("code").notNull(),
    // SMS phone verification: sha256 of the 6-digit code; the pending slot is held until verify_expires_at.
    phoneVerified: boolean("phone_verified").notNull().default(false),
    verifyCodeHash: text("verify_code_hash"),
    verifyExpiresAt: tstz("verify_expires_at"),
    verifyAttempts: integer("verify_attempts").notNull().default(0),
    verifySends: integer("verify_sends").notNull().default(0),
    verifyLastSentAt: tstz("verify_last_sent_at"),
    cancelledAt: tstz("cancelled_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("bookings_dealer_starts_idx").on(t.dealerId, t.startsAt),
    index("bookings_car_starts_idx").on(t.carId, t.startsAt),
    index("bookings_dealer_phone_created_idx").on(t.dealerId, t.customerPhone, t.createdAt),
    check("bookings_valid_range", sql`${t.endsAt} > ${t.startsAt}`),
  ],
);
