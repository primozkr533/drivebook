import { integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { createdAt, updatedAt } from "./columns";

export const plans = pgTable("plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  maxCars: integer("max_cars").notNull(),
  maxUsers: integer("max_users").notNull(),
  smsIncluded: integer("sms_included").notNull(),
  priceEurCents: integer("price_eur_cents").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});
