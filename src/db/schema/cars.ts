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
    year: integer("year").notNull(),
    priceEur: integer("price_eur").notNull(),
    body: carBody("body").notNull(),
    avtoNetUrl: text("avto_net_url"),
    imageKey: text("image_key"),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("cars_dealer_id_idx").on(t.dealerId),
    index("cars_dealer_id_active_idx").on(t.dealerId, t.active),
    unique("cars_dealer_avto_net_url_unique").on(t.dealerId, t.avtoNetUrl),
  ],
);
