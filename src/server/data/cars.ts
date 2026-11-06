import { and, asc, count, eq, max } from "drizzle-orm";
import type { Car } from "@/components/signature";
import { bookings, cars } from "@/db/schema";
import { requireDealerRole } from "@/server/auth/permissions";
import { fetchListingHtml, normalizeAvtoNetUrl, readListing, type ListingFetcher } from "@/server/avtonet";
import type { DealerContext } from "./context";
import { db } from "./db";
import { withDealerMutation } from "./mutate";

type CarRow = typeof cars.$inferSelect;

function toCar(row: CarRow): Car {
  return {
    id: row.id,
    make: row.make,
    model: row.model,
    trim: row.trim ?? undefined,
    year: row.year ?? undefined,
    mileageKm: row.mileageKm ?? undefined,
    priceEur: row.priceEur ?? undefined,
    imageUrl: row.imageUrl ?? undefined,
    body: row.body ?? undefined,
    avtoNetUrl: row.avtoNetUrl,
    notes: row.notes ?? undefined,
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

// ---- Dealer admin: car management (Owner and Salesperson) ----

const CAR_ROLES = ["owner", "salesperson"] as const;

export const CAR_NOTES_MAX = 500;
export const CAR_TEXT_MAX = 80;
export const CAR_MIN_YEAR = 1950;
export const CAR_MAX_MILEAGE = 2_000_000;
export const CAR_MAX_PRICE = 10_000_000;

export type CarField = "avtoNetUrl" | "notes" | "make" | "model" | "year" | "mileageKm" | "priceEur";
export type CarError = "required" | "invalid" | "too_long" | "out_of_range" | "taken";
export type CarInput = Partial<Record<CarField, string>>;
type CarErrors = Partial<Record<CarField, CarError>>;

export type AdminCar = Car & { bookingCount: number };

export type AddCarResult =
  | { ok: true; car: Car; fromListing: boolean }
  // needsDetails: the listing could not be read, so the dealer must enter make/model/… by hand.
  | { ok: false; errors: CarErrors; needsDetails: boolean };
export type UpdateCarResult = { ok: true; car: Car } | { ok: false; errors: CarErrors } | { ok: false; notFound: true };
export type CarByIdResult = { ok: true } | { ok: false; notFound: true } | { ok: false; hasBookings: true };

let listingFetcher: ListingFetcher = fetchListingHtml;
export function setListingFetcherForTests(fetcher: ListingFetcher | undefined): void {
  listingFetcher = fetcher ?? fetchListingHtml;
}

function optionalText(raw: string | undefined, field: CarField, max: number, errors: CarErrors): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  if (value.length > max) errors[field] = "too_long";
  return value;
}

function optionalInt(raw: string | undefined, field: CarField, min: number, maxValue: number, errors: CarErrors): number | null {
  const value = (raw ?? "").trim().replace(/[.\s ]/g, "");
  if (!value) return null;
  if (!/^\d+$/.test(value)) {
    errors[field] = "invalid";
    return null;
  }
  const n = Number(value);
  if (n < min || n > maxValue) errors[field] = "out_of_range";
  return n;
}

type CarDetails = {
  make: string | null;
  model: string | null;
  year: number | null;
  mileageKm: number | null;
  priceEur: number | null;
};

function validateDetails(input: CarInput, maxYear: number, errors: CarErrors): CarDetails {
  return {
    make: optionalText(input.make, "make", CAR_TEXT_MAX, errors),
    model: optionalText(input.model, "model", CAR_TEXT_MAX, errors),
    year: optionalInt(input.year, "year", CAR_MIN_YEAR, maxYear, errors),
    mileageKm: optionalInt(input.mileageKm, "mileageKm", 0, CAR_MAX_MILEAGE, errors),
    priceEur: optionalInt(input.priceEur, "priceEur", 0, CAR_MAX_PRICE, errors),
  };
}

const hasManualDetails = (input: CarInput) =>
  (["make", "model", "year", "mileageKm", "priceEur"] as const).some((f) => (input[f] ?? "").trim() !== "");

export async function listCarsForAdmin(ctx: DealerContext): Promise<AdminCar[]> {
  await requireDealerRole(ctx, [...CAR_ROLES]);
  const [rows, counts] = await Promise.all([
    db()
      .select()
      .from(cars)
      .where(eq(cars.dealerId, ctx.dealerId))
      .orderBy(asc(cars.sortOrder), asc(cars.createdAt)),
    db()
      .select({ carId: bookings.carId, n: count() })
      .from(bookings)
      .where(eq(bookings.dealerId, ctx.dealerId))
      .groupBy(bookings.carId),
  ]);
  const byCar = new Map(counts.map((c) => [c.carId, c.n]));
  return rows.map((r) => ({ ...toCar(r), bookingCount: byCar.get(r.id) ?? 0 }));
}

/**
 * Adds a car from its avto.net link. The listing is read first; when that fails (avto.net blocks
 * many server requests) and no manual details were sent, the result asks for them (`needsDetails`).
 * Manually entered values always win over values read from the listing.
 */
export async function addCar(ctx: DealerContext, input: CarInput, now: Date = new Date()): Promise<AddCarResult> {
  const actor = await requireDealerRole(ctx, [...CAR_ROLES]);
  const errors: CarErrors = {};
  const rawUrl = (input.avtoNetUrl ?? "").trim();
  const avtoNetUrl = rawUrl ? normalizeAvtoNetUrl(rawUrl) : null;
  if (!rawUrl) errors.avtoNetUrl = "required";
  else if (!avtoNetUrl) errors.avtoNetUrl = "invalid";
  const notes = optionalText(input.notes, "notes", CAR_NOTES_MAX, errors);
  const manual = validateDetails(input, now.getUTCFullYear() + 1, errors);
  const manualMode = hasManualDetails(input);
  if (Object.keys(errors).length > 0 || !avtoNetUrl) return { ok: false, errors, needsDetails: manualMode };

  const [existing] = await db()
    .select({ id: cars.id })
    .from(cars)
    .where(and(eq(cars.dealerId, ctx.dealerId), eq(cars.avtoNetUrl, avtoNetUrl)))
    .limit(1);
  if (existing) return { ok: false, errors: { avtoNetUrl: "taken" }, needsDetails: manualMode };

  const listing = await readListing(avtoNetUrl, listingFetcher);
  const make = manual.make ?? listing?.make ?? null;
  const model = manual.model ?? listing?.model ?? null;
  if (!make || !model) {
    const missing: CarErrors = {};
    if (manualMode && !make) missing.make = "required";
    if (manualMode && !model) missing.model = "required";
    return { ok: false, errors: missing, needsDetails: true };
  }

  const values = {
    dealerId: ctx.dealerId,
    make,
    model,
    year: manual.year ?? listing?.year ?? null,
    mileageKm: manual.mileageKm ?? listing?.mileageKm ?? null,
    priceEur: manual.priceEur ?? listing?.priceEur ?? null,
    imageUrl: listing?.imageUrl ?? null,
    avtoNetUrl,
    notes,
  };
  const row = await withDealerMutation(
    ctx,
    async (tx) => {
      const [{ last }] = await tx.select({ last: max(cars.sortOrder) }).from(cars).where(eq(cars.dealerId, ctx.dealerId));
      const [inserted] = await tx
        .insert(cars)
        .values({ ...values, sortOrder: (last ?? -1) + 1 })
        .onConflictDoNothing()
        .returning();
      return inserted ?? null;
    },
    (inserted) => ({
      action: "car.add",
      entity: "car",
      entityId: inserted?.id,
      actorKind: "dealer_user",
      actorId: actor.userId,
      data: { avtoNetUrl, fromListing: listing !== null },
    }),
  );
  if (!row) return { ok: false, errors: { avtoNetUrl: "taken" }, needsDetails: manualMode };
  return { ok: true, car: toCar(row), fromListing: listing !== null };
}

export async function updateCar(ctx: DealerContext, carId: string, input: CarInput, now: Date = new Date()): Promise<UpdateCarResult> {
  const actor = await requireDealerRole(ctx, [...CAR_ROLES]);
  const errors: CarErrors = {};
  const notes = optionalText(input.notes, "notes", CAR_NOTES_MAX, errors);
  const details = validateDetails(input, now.getUTCFullYear() + 1, errors);
  if (!details.make && !errors.make) errors.make = "required";
  if (!details.model && !errors.model) errors.model = "required";
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const row = await withDealerMutation(
    ctx,
    async (tx) => {
      const [updated] = await tx
        .update(cars)
        .set({
          make: details.make!,
          model: details.model!,
          year: details.year,
          mileageKm: details.mileageKm,
          priceEur: details.priceEur,
          notes,
          updatedAt: new Date(),
        })
        .where(and(eq(cars.dealerId, ctx.dealerId), eq(cars.id, carId)))
        .returning();
      return updated ?? null;
    },
    (updated) => ({ action: "car.update", entity: "car", entityId: updated?.id ?? carId, actorKind: "dealer_user", actorId: actor.userId }),
  );
  return row ? { ok: true, car: toCar(row) } : { ok: false, notFound: true };
}

export async function setCarActive(ctx: DealerContext, carId: string, active: boolean): Promise<CarByIdResult> {
  const actor = await requireDealerRole(ctx, [...CAR_ROLES]);
  const found = await withDealerMutation(
    ctx,
    async (tx) => {
      const [updated] = await tx
        .update(cars)
        .set({ active, updatedAt: new Date() })
        .where(and(eq(cars.dealerId, ctx.dealerId), eq(cars.id, carId)))
        .returning({ id: cars.id });
      return Boolean(updated);
    },
    { action: active ? "car.show" : "car.hide", entity: "car", entityId: carId, actorKind: "dealer_user", actorId: actor.userId },
  );
  return found ? { ok: true } : { ok: false, notFound: true };
}

/** Deletes a car that has never been booked; booked cars can only be hidden (their bookings keep history). */
export async function deleteCar(ctx: DealerContext, carId: string): Promise<CarByIdResult> {
  const actor = await requireDealerRole(ctx, [...CAR_ROLES]);
  return withDealerMutation(
    ctx,
    async (tx): Promise<CarByIdResult> => {
      const [car] = await tx
        .select({ id: cars.id })
        .from(cars)
        .where(and(eq(cars.dealerId, ctx.dealerId), eq(cars.id, carId)))
        .for("update");
      if (!car) return { ok: false, notFound: true };
      const [{ n }] = await tx.select({ n: count() }).from(bookings).where(eq(bookings.carId, carId));
      if (n > 0) return { ok: false, hasBookings: true };
      await tx.delete(cars).where(and(eq(cars.dealerId, ctx.dealerId), eq(cars.id, carId)));
      return { ok: true };
    },
    (result) => ({
      action: result.ok ? "car.delete" : "car.delete_refused",
      entity: "car",
      entityId: carId,
      actorKind: "dealer_user",
      actorId: actor.userId,
    }),
  );
}
