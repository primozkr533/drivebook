import { integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { createdAt, updatedAt } from "./columns";

export const plans = pgTable("plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  name: text("name").notNull().unique(),
  maxCars: integer("max_cars").notNull(),
  maxUsers: integer("max_users").notNull(),
  monthlySmsQuota: integer("monthly_sms_quota").notNull().default(300),
  priceEurCents: integer("price_eur_cents").notNull(),
  notes: text("notes"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});
