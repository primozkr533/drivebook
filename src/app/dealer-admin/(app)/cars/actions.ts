"use server";

import { refresh } from "next/cache";
import { notFound } from "next/navigation";
import { DealerReadOnlyError, ForbiddenError, requireDealerUser } from "@/server/auth/permissions";
import { addCar, deleteCar, setCarActive, updateCar, type CarError, type CarField, type CarInput } from "@/server/data/cars";

export type CarsActionError = "forbidden" | "readOnly" | "hasBookings";

export type CarFormValues = Record<CarField, string>;
export type AddCarState = {
  values?: CarFormValues;
  errors?: Partial<Record<CarField, CarError>>;
  error?: CarsActionError;
  needsDetails?: boolean;
  added?: { id: string; fromListing: boolean };
};
export type UpdateCarState = { values?: CarFormValues; errors?: Partial<Record<CarField, CarError>>; error?: CarsActionError; savedAt?: number };
export type CarToggleState = { active: boolean; error?: CarsActionError };
export type DeleteCarState = { error?: CarsActionError };

const FIELDS: CarField[] = ["avtoNetUrl", "notes", "make", "model", "year", "mileageKm", "priceEur"];

const text = (form: FormData, name: string) => {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
};

function values(form: FormData): CarFormValues {
  return Object.fromEntries(FIELDS.map((f) => [f, text(form, f)])) as CarFormValues;
}

function refused(err: unknown): CarsActionError {
  if (err instanceof ForbiddenError) return "forbidden";
  if (err instanceof DealerReadOnlyError) return "readOnly";
  throw err;
}

export async function addCarAction(_prev: AddCarState, form: FormData): Promise<AddCarState> {
  const { ctx } = await requireDealerUser();
  const input: CarInput = values(form);
  try {
    const result = await addCar(ctx, input);
    if (!result.ok) return { values: values(form), errors: result.errors, needsDetails: result.needsDetails };
    refresh();
    return { added: { id: result.car.id, fromListing: result.fromListing } };
  } catch (err) {
    return { values: values(form), error: refused(err), needsDetails: text(form, "manual") === "1" };
  }
}

export async function updateCarAction(_prev: UpdateCarState, form: FormData): Promise<UpdateCarState> {
  const { ctx } = await requireDealerUser();
  let result: Awaited<ReturnType<typeof updateCar>>;
  try {
    result = await updateCar(ctx, text(form, "id"), values(form));
  } catch (err) {
    return { values: values(form), error: refused(err) };
  }
  if ("notFound" in result) notFound();
  if (!result.ok) return { values: values(form), errors: result.errors };
  refresh();
  return { savedAt: Date.now() };
}

export async function setCarActiveAction(prev: CarToggleState, form: FormData): Promise<CarToggleState> {
  const { ctx } = await requireDealerUser();
  const active = text(form, "active") === "true";
  let result: Awaited<ReturnType<typeof setCarActive>>;
  try {
    result = await setCarActive(ctx, text(form, "id"), active);
  } catch (err) {
    return { active: prev.active, error: refused(err) };
  }
  if (!result.ok) notFound();
  refresh();
  return { active };
}

export async function deleteCarAction(_prev: DeleteCarState, form: FormData): Promise<DeleteCarState> {
  const { ctx } = await requireDealerUser();
  let result: Awaited<ReturnType<typeof deleteCar>>;
  try {
    result = await deleteCar(ctx, text(form, "id"));
  } catch (err) {
    return { error: refused(err) };
  }
  if ("notFound" in result) notFound();
  if ("hasBookings" in result) return { error: "hasBookings" };
  refresh();
  return {};
}
