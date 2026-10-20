import { asc, eq } from "drizzle-orm";
import { openingHours } from "@/db/schema";
import type { DealerContext } from "./context";
import { db } from "./db";

export type OpeningHours = { isoWeekday: number; opensAt: string; closesAt: string };

export async function listOpeningHours(ctx: DealerContext): Promise<OpeningHours[]> {
  const rows = await db()
    .select({ isoWeekday: openingHours.isoWeekday, opensAt: openingHours.opensAt, closesAt: openingHours.closesAt })
    .from(openingHours)
    .where(eq(openingHours.dealerId, ctx.dealerId))
    .orderBy(asc(openingHours.isoWeekday), asc(openingHours.opensAt));
  // Postgres returns time as HH:MM:SS; the UI works in whole minutes.
  return rows.map((r) => ({ isoWeekday: r.isoWeekday, opensAt: r.opensAt.slice(0, 5), closesAt: r.closesAt.slice(0, 5) }));
}
