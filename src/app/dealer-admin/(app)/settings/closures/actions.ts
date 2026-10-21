"use server";

import { refresh } from "next/cache";
import { notFound } from "next/navigation";
import { DealerReadOnlyError, ForbiddenError, requireDealerUser } from "@/server/auth/permissions";
import {
  addClosure,
  deleteClosure,
  setHolidayOpenAnyway,
  type ClosureError,
  type ClosureField,
} from "@/server/data/settings-hours";

export type ClosuresActionError = "forbidden" | "readOnly";

export type HolidayToggleState = { openAnyway: boolean; error?: ClosuresActionError };

export type ClosureFormValues = Record<ClosureField, string>;
export type ClosureFormState = {
  values?: ClosureFormValues;
  errors?: Partial<Record<ClosureField, ClosureError>>;
  error?: ClosuresActionError;
  added?: string;
};

export type DeleteClosureState = { error?: ClosuresActionError };

const text = (form: FormData, name: string) => {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
};

function refused(err: unknown): ClosuresActionError {
  if (err instanceof ForbiddenError) return "forbidden";
  if (err instanceof DealerReadOnlyError) return "readOnly";
  throw err;
}

export async function setHolidayOpenAnywayAction(prev: HolidayToggleState, form: FormData): Promise<HolidayToggleState> {
  const { ctx } = await requireDealerUser();
  let result: Awaited<ReturnType<typeof setHolidayOpenAnyway>>;
  try {
    result = await setHolidayOpenAnyway(ctx, text(form, "id"), text(form, "openAnyway") === "true");
  } catch (err) {
    return { openAnyway: prev.openAnyway, error: refused(err) };
  }
  if (!result.ok) notFound();
  refresh();
  return { openAnyway: result.holiday.openAnyway };
}

export async function addClosureAction(_prev: ClosureFormState, form: FormData): Promise<ClosureFormState> {
  const { ctx } = await requireDealerUser();
  const values: ClosureFormValues = { startDate: text(form, "startDate"), endDate: text(form, "endDate"), reason: text(form, "reason") };
  try {
    const result = await addClosure(ctx, values);
    if (!result.ok) return { values, errors: result.errors };
    refresh();
    return { added: result.closure.id };
  } catch (err) {
    return { values, error: refused(err) };
  }
}

export async function deleteClosureAction(_prev: DeleteClosureState, form: FormData): Promise<DeleteClosureState> {
  const { ctx } = await requireDealerUser();
  let result: Awaited<ReturnType<typeof deleteClosure>>;
  try {
    result = await deleteClosure(ctx, text(form, "id"));
  } catch (err) {
    return { error: refused(err) };
  }
  if (!result.ok) notFound();
  refresh();
  return {};
}
