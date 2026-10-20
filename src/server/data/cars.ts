import { and, asc, eq } from "drizzle-orm";
import type { Car } from "@/components/signature";
import { cars } from "@/db/schema";
import type { DealerContext } from "./context";
import { db } from "./db";

type CarRow = typeof cars.$inferSelect;

function toCar(row: CarRow): Car {
  return {
    id: row.id,
    make: row.make,
    model: row.model,
    trim: row.trim ?? undefined,
    year: row.year,
    priceEur: row.priceEur,
    // File storage is not wired yet, so a stored image_key has no public URL.
    imageUrl: undefined,
    body: row.body,
    avtoNetUrl: row.avtoNetUrl,
    active: row.active,
  };
}

export async function listActiveCars(ctx: DealerContext): Promise<Car[]> {
  const rows = await db()
    .select()
    .from(cars)
    .where(and(eq(cars.dealerId, ctx.dealerId), eq(cars.active, true)))
    .orderBy(asc(cars.sortOrder), asc(cars.createdAt));
  return rows.map(toCar);
}

export async function getCar(ctx: DealerContext, carId: string): Promise<Car | null> {
  const [row] = await db()
    .select()
    .from(cars)
    .where(and(eq(cars.dealerId, ctx.dealerId), eq(cars.id, carId)))
    .limit(1);
  return row ? toCar(row) : null;
}
