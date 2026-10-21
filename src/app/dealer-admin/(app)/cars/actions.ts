"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import {
  DealerReadOnlyError,
  ForbiddenError,
  getSurfaceBasePath,
  requireDealerUser,
} from "@/server/auth/permissions";
import { fetchAvtonetListing, type AvtonetFailure } from "@/server/cars/avtonet";
import {
  CarLimitError,
  CarNotFoundError,
  createCar,
  setCarActive,
  updateCar,
  type CarFieldError,
  type CarImageInput,
} from "@/server/data/cars";
import { parseCarStatusFilter } from "./form-model";
import { carsListHref, type CarListNotice } from "./notice";

const CARS_LIST_PATH = "/dealer-admin/cars";

export type CarFormField = "make" | "model" | "year" | "price" | "avtonetUrl" | "imageFile" | "imageUrl";

export type CarFormValues = {
  id: string;
  make: string;
  model: string;
  year: string;
  price: string;
  avtonetUrl: string;
  imageUrl: string;
  removeImage: string;
};

export type SaveCarState =
  | { ok: true; id: string }
  | {
      ok: false;
      fieldErrors: Partial<Record<CarFormField, CarFieldError>>;
      error?: "forbidden" | "readOnly" | "limit";
      values?: CarFormValues;
    };

export type AutofillResult =
  | { ok: true; fields: { make?: string; model?: string; year?: number; price?: number; imageUrl?: string } }
  | { ok: false; reason: AvtonetFailure };

const text = (form: FormData, name: string) => {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
};

function parseInteger(raw: string): number | "required" {
  const value = raw.trim().replace(/\s/g, "");
  return value ? Number(value) : "required";
}

async function imageFrom(form: FormData, values: CarFormValues): Promise<CarImageInput> {
  const file = form.get("imageFile");
  if (file instanceof File && file.size > 0) return { kind: "upload", bytes: new Uint8Array(await file.arrayBuffer()) };
  if (values.imageUrl.trim()) return { kind: "url", url: values.imageUrl.trim() };
  return { kind: values.removeImage === "1" ? "remove" : "keep" };
}

function revalidateCars(slug: string) {
  revalidatePath(CARS_LIST_PATH);
  revalidatePath(`/site/${slug}`);
}

export async function saveCarAction(_prev: SaveCarState | null, form: FormData): Promise<SaveCarState> {
  const { ctx } = await requireDealerUser();
  const values: CarFormValues = {
    id: text(form, "id").trim(),
    make: text(form, "make"),
    model: text(form, "model"),
    year: text(form, "year"),
    price: text(form, "price"),
    avtonetUrl: text(form, "avtonetUrl"),
    imageUrl: text(form, "imageUrl"),
    removeImage: text(form, "removeImage"),
  };

  const year = parseInteger(values.year);
  const price = parseInteger(values.price);
  const image = await imageFrom(form, values);
  const fieldErrors: Partial<Record<CarFormField, CarFieldError>> = {};
  if (year === "required") fieldErrors.year = "required";
  if (price === "required") fieldErrors.price = "required";
  if (!values.make.trim()) fieldErrors.make = "required";
  if (!values.model.trim()) fieldErrors.model = "required";
  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors, values };

  const input = {
    make: values.make,
    model: values.model,
    year: year as number,
    priceEur: price as number,
    avtonetUrl: values.avtonetUrl,
    image,
  };

  try {
    const result = values.id ? await updateCar(ctx, values.id, input) : await createCar(ctx, input);
    if (!result.ok) {
      const { priceEur, image: imageError, ...rest } = result.errors;
      return {
        ok: false,
        fieldErrors: {
          ...rest,
          ...(priceEur && { price: priceEur }),
          ...(imageError && { [image.kind === "upload" ? "imageFile" : "imageUrl"]: imageError }),
        },
        values,
      };
    }
    revalidateCars(ctx.slug);
    return { ok: true, id: result.car.id };
  } catch (err) {
    if (err instanceof CarNotFoundError) notFound();
    if (err instanceof ForbiddenError) return { ok: false, fieldErrors: {}, error: "forbidden", values };
    if (err instanceof DealerReadOnlyError) return { ok: false, fieldErrors: {}, error: "readOnly", values };
    if (err instanceof CarLimitError) return { ok: false, fieldErrors: {}, error: "limit", values };
    throw err;
  }
}

export async function setCarActiveAction(form: FormData): Promise<void> {
  const { ctx } = await requireDealerUser();
  let notice: CarListNotice | undefined;
  try {
    await setCarActive(ctx, text(form, "id"), text(form, "active") === "1");
  } catch (err) {
    if (err instanceof CarNotFoundError) notFound();
    if (err instanceof ForbiddenError) notice = "forbidden";
    else if (err instanceof DealerReadOnlyError) notice = "readOnly";
    else if (err instanceof CarLimitError) notice = "limit";
    else throw err;
  }
  if (notice) {
    redirect(carsListHref(`${await getSurfaceBasePath()}/cars`, parseCarStatusFilter(text(form, "filter")), notice));
  }
  revalidateCars(ctx.slug);
}

export async function autofillFromAvtonetAction(url: string): Promise<AutofillResult> {
  await requireDealerUser();
  try {
    const result = await fetchAvtonetListing(typeof url === "string" ? url.trim() : "");
    if (!result.ok) return result;
    const { priceEur, ...fields } = result.fields;
    return { ok: true, fields: { ...fields, ...(priceEur !== undefined && { price: priceEur }) } };
  } catch {
    return { ok: false, reason: "http_error" };
  }
}
