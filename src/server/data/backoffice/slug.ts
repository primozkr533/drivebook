import { and, eq, ne } from "drizzle-orm";
import { dealers, dealerSlugHistory } from "@/db/schema";
import { isReservedSlug } from "@/lib/config";
import { db } from "../db";

export type SlugError = "format" | "length" | "reserved" | "taken";
export type SlugValidation = { ok: true } | { ok: false; error: SlugError };

export const SLUG_MIN_LENGTH = 3;
export const SLUG_MAX_LENGTH = 40;

export async function validateSlug(slug: string, opts: { excludeDealerId?: string } = {}): Promise<SlugValidation> {
  if (!/^[a-z0-9-]*$/.test(slug)) return { ok: false, error: "format" };
  if (slug.length < SLUG_MIN_LENGTH || slug.length > SLUG_MAX_LENGTH) return { ok: false, error: "length" };
  if (isReservedSlug(slug)) return { ok: false, error: "reserved" };

  const notExcluded = (column: typeof dealers.id | typeof dealerSlugHistory.dealerId) =>
    opts.excludeDealerId ? ne(column, opts.excludeDealerId) : undefined;

  const [current] = await db()
    .select({ id: dealers.id })
    .from(dealers)
    .where(and(eq(dealers.slug, slug), notExcluded(dealers.id)))
    .limit(1);
  if (current) return { ok: false, error: "taken" };

  // Old slugs keep redirecting to their dealer, so they can never be reused by another one.
  const [historical] = await db()
    .select({ id: dealerSlugHistory.id })
    .from(dealerSlugHistory)
    .where(and(eq(dealerSlugHistory.slug, slug), notExcluded(dealerSlugHistory.dealerId)))
    .limit(1);
  if (historical) return { ok: false, error: "taken" };

  return { ok: true };
}
