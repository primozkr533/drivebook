import { boolean, index, integer, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import { newPublicId } from "../ids";
import { createdAt, updatedAt } from "./columns";
import { dealers } from "./dealers";
import { carBody } from "./enums";

export const cars = pgTable(
  "cars",
  {
    // Public in URLs, so it must be unguessable rather than serial.
    id: text("id").primaryKey().$defaultFn(newPublicId),
    dealerId: uuid("dealer_id")
      .notNull()
      .references(() => dealers.id, { onDelete: "cascade" }),
    make: text("make").notNull(),
    model: text("model").notNull(),
    trim: text("trim"),
    // Read from the avto.net listing when possible, otherwise entered by the dealer.
    year: integer("year"),
    mileageKm: integer("mileage_km"),
    priceEur: integer("price_eur"),
    body: carBody("body"),
    avtoNetUrl: text("avto_net_url").notNull(),
    // Remote listing photo (avto.net), shown as-is; imageKey is a stored upload.
    imageUrl: text("image_url"),
    imageKey: text("image_key"),
    // Dealer's note, shown to customers on the public page.
    notes: text("notes"),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("cars_dealer_id_idx").on(t.dealerId),
    unique("cars_dealer_avto_net_url_unique").on(t.dealerId, t.avtoNetUrl),
  ],
);
