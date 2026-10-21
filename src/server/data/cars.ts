import { and, asc, desc, eq } from "drizzle-orm";
import type { Car } from "@/components/signature";
import { cars } from "@/db/schema";
import { ljubljanaNow } from "@/lib/date";
import { requireDealerRole, type DealerActor } from "@/server/auth/permissions";
import { isAvtonetUrl } from "@/server/cars/avtonet";
import { CarImageError, processCarImage, storeCarImageFromUrl, type CarImageErrorCode } from "@/server/cars/images";
import { getStorage } from "@/server/storage";
import type { DealerContext } from "./context";
import { db } from "./db";
import { withDealerMutation, type AuditEntry } from "./mutate";

type CarRow = typeof cars.$inferSelect;
type CarBody = CarRow["body"];

export type AdminCar = Car & { active: boolean; createdAt: Date; updatedAt: Date };

export type CarStatusFilter = "active" | "inactive" | "all";

export type CarImageInput =
  | { kind: "upload"; bytes: Uint8Array }
  | { kind: "url"; url: string }
  | { kind: "keep" }
  | { kind: "remove" };

export type CarInput = {
  make: string;
  model: string;
  year: number;
  priceEur: number;
  avtonetUrl?: string;
  body?: CarBody;
  image?: CarImageInput;
};

export type CarField = "make" | "model" | "year" | "priceEur" | "avtonetUrl" | "image";
export type CarFieldError = "required" | "too_long" | "out_of_range" | "invalid" | "taken" | CarImageErrorCode;
export type CarFieldErrors = Partial<Record<CarField, CarFieldError>>;

export type SaveCarResult = { ok: true; car: AdminCar } | { ok: false; errors: CarFieldErrors };

export class CarNotFoundError extends Error {
  constructor() {
    super("Car not found");
    this.name = "CarNotFoundError";
  }
}

export const MIN_CAR_YEAR = 1950;
export const MAX_CAR_PRICE_EUR = 10_000_000;
const MAX_NAME_LENGTH = 60;
const DEFAULT_BODY: CarBody = "sedan";

function toCar(row: CarRow): Car {
  return {
    id: row.id,
    make: row.make,
    model: row.model,
    trim: row.trim ?? undefined,
    year: row.year,
    priceEur: row.priceEur,
    imageUrl: row.imageKey ? getStorage().url(row.imageKey) : undefined,
    body: row.body,
    avtoNetUrl: row.avtoNetUrl ?? undefined,
    active: row.active,
  };
}

const toAdminCar = (row: CarRow): AdminCar => ({
  ...toCar(row),
  active: row.active,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

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
    .where(and(eq(cars.dealerId, ctx.dealerId), eq(cars.id, carId), eq(cars.active, true)))
    .limit(1);
  return row ? toCar(row) : null;
}

export async function listCarsForAdmin(
  ctx: DealerContext,
  { status }: { status: CarStatusFilter },
): Promise<AdminCar[]> {
  await requireDealerRole(ctx, ["owner", "salesperson"]);
  const filters = [eq(cars.dealerId, ctx.dealerId)];
  if (status !== "all") filters.push(eq(cars.active, status === "active"));
  const rows = await db()
    .select()
    .from(cars)
    .where(and(...filters))
    .orderBy(desc(cars.createdAt), desc(cars.id));
  return rows.map(toAdminCar);
}

async function findCar(ctx: DealerContext, publicId: string): Promise<CarRow | null> {
  const [row] = await db()
    .select()
    .from(cars)
    .where(and(eq(cars.dealerId, ctx.dealerId), eq(cars.id, publicId)))
    .limit(1);
  return row ?? null;
}

export async function getCarForAdmin(ctx: DealerContext, publicId: string): Promise<AdminCar | null> {
  await requireDealerRole(ctx, ["owner", "salesperson"]);
  const row = await findCar(ctx, publicId);
  return row ? toAdminCar(row) : null;
}

type ValidCar = { make: string; model: string; year: number; priceEur: number; avtoNetUrl: string | null };

function validateCar(input: CarInput): { ok: true; value: ValidCar } | { ok: false; errors: CarFieldErrors } {
  const errors: CarFieldErrors = {};
  const name = (raw: string, field: "make" | "model") => {
    const value = (raw ?? "").trim();
    if (!value) errors[field] = "required";
    else if (value.length > MAX_NAME_LENGTH) errors[field] = "too_long";
    return value;
  };
  const make = name(input.make, "make");
  const model = name(input.model, "model");

  const maxYear = Number(ljubljanaNow().dateISO.slice(0, 4)) + 1;
  if (!Number.isInteger(input.year)) errors.year = "invalid";
  else if (input.year < MIN_CAR_YEAR || input.year > maxYear) errors.year = "out_of_range";

  if (!Number.isInteger(input.priceEur)) errors.priceEur = "invalid";
  else if (input.priceEur < 0 || input.priceEur > MAX_CAR_PRICE_EUR) errors.priceEur = "out_of_range";

  const avtoNetUrl = input.avtonetUrl?.trim() || null;
  if (avtoNetUrl && !isAvtonetUrl(avtoNetUrl)) errors.avtonetUrl = "invalid";

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { make, model, year: input.year, priceEur: input.priceEur, avtoNetUrl } };
}

async function storeImage(image: CarImageInput | undefined): Promise<string | null> {
  if (image?.kind === "upload") return (await processCarImage(image.bytes)).key;
  if (image?.kind === "url") return (await storeCarImageFromUrl(image.url.trim())).key;
  return null;
}

async function deleteQuietly(key: string): Promise<void> {
  try {
    await getStorage().delete(key);
  } catch (error) {
    console.error(`[cars] failed to delete image ${key}`, error);
  }
}

const isUniqueViolation = (error: unknown): boolean =>
  error instanceof Error &&
  ((error as { code?: string }).code === "23505" || (error.cause as { code?: string } | undefined)?.code === "23505");

const audit = (actor: DealerActor, entry: Omit<AuditEntry, "actorKind" | "actorId" | "entity">): AuditEntry => ({
  ...entry,
  entity: "car",
  actorKind: "dealer_user",
  actorId: actor.userId,
});

const snapshot = (row: CarRow) => ({
  make: row.make,
  model: row.model,
  year: row.year,
  priceEur: row.priceEur,
  avtoNetUrl: row.avtoNetUrl,
  imageKey: row.imageKey,
  active: row.active,
});

// Images are processed before the transaction; a failed write must not leave the new file behind.
async function saveWithImage(
  input: CarInput,
  write: (value: ValidCar, newImageKey: string | null) => Promise<{ row: CarRow; previousImageKey: string | null }>,
): Promise<SaveCarResult> {
  const validated = validateCar(input);
  if (!validated.ok) return validated;

  let newImageKey: string | null;
  try {
    newImageKey = await storeImage(input.image);
  } catch (error) {
    if (error instanceof CarImageError) return { ok: false, errors: { image: error.code } };
    throw error;
  }

  let saved: { row: CarRow; previousImageKey: string | null };
  try {
    saved = await write(validated.value, newImageKey);
  } catch (error) {
    if (newImageKey) await deleteQuietly(newImageKey);
    if (isUniqueViolation(error)) return { ok: false, errors: { avtonetUrl: "taken" } };
    throw error;
  }
  if (saved.previousImageKey && saved.previousImageKey !== saved.row.imageKey) {
    await deleteQuietly(saved.previousImageKey);
  }
  return { ok: true, car: toAdminCar(saved.row) };
}

export async function createCar(ctx: DealerContext, input: CarInput): Promise<SaveCarResult> {
  const actor = await requireDealerRole(ctx, ["owner", "salesperson"]);
  return saveWithImage(input, async (value, imageKey) => {
    const row = await withDealerMutation(
      ctx,
      async (tx) => {
        const [inserted] = await tx
          .insert(cars)
          .values({ dealerId: ctx.dealerId, ...value, body: input.body ?? DEFAULT_BODY, imageKey })
          .returning();
        return inserted;
      },
      (inserted) => audit(actor, { action: "car.create", entityId: inserted.id, data: { after: snapshot(inserted) } }),
    );
    return { row, previousImageKey: null };
  });
}

export async function updateCar(ctx: DealerContext, publicId: string, input: CarInput): Promise<SaveCarResult> {
  const actor = await requireDealerRole(ctx, ["owner", "salesperson"]);
  if (!(await findCar(ctx, publicId))) throw new CarNotFoundError();

  return saveWithImage(input, async (value, newImageKey) => {
    const kind = input.image?.kind ?? "keep";
    const { before, after } = await withDealerMutation(
      ctx,
      async (tx) => {
        const [current] = await tx
          .select()
          .from(cars)
          .where(and(eq(cars.dealerId, ctx.dealerId), eq(cars.id, publicId)))
          .for("update");
        if (!current) throw new CarNotFoundError();
        const imageKey = kind === "keep" ? current.imageKey : newImageKey;
        const [updated] = await tx
          .update(cars)
          .set({ ...value, body: input.body ?? current.body, imageKey, updatedAt: new Date() })
          .where(and(eq(cars.dealerId, ctx.dealerId), eq(cars.id, publicId)))
          .returning();
        return { before: current, after: updated };
      },
      (r) =>
        audit(actor, {
          action: "car.update",
          entityId: publicId,
          data: { before: snapshot(r.before), after: snapshot(r.after) },
        }),
    );
    return { row: after, previousImageKey: before.imageKey };
  });
}

export async function setCarActive(ctx: DealerContext, publicId: string, active: boolean): Promise<AdminCar> {
  const actor = await requireDealerRole(ctx, ["owner", "salesperson"]);
  const row = await withDealerMutation(
    ctx,
    async (tx) => {
      const [updated] = await tx
        .update(cars)
        .set({ active, updatedAt: new Date() })
        .where(and(eq(cars.dealerId, ctx.dealerId), eq(cars.id, publicId)))
        .returning();
      if (!updated) throw new CarNotFoundError();
      return updated;
    },
    () =>
      audit(actor, {
        action: active ? "car.reactivate" : "car.deactivate",
        entityId: publicId,
        data: { after: { active } },
      }),
  );
  return toAdminCar(row);
}
