"use server";

import { DealerReadOnlyError, ForbiddenError, requireDealerUser } from "@/server/auth/permissions";
import { updateBookingRules } from "@/server/data/settings-booking";
import {
  readFormValues,
  toFormErrors,
  toFormValues,
  toRulesInput,
  type BookingFormErrors,
  type BookingFormValues,
} from "./fields";

export type BookingRulesFormState = {
  values?: BookingFormValues;
  errors?: BookingFormErrors;
  error?: "forbidden" | "readOnly";
  saved?: boolean;
};

export async function saveBookingRulesAction(_prev: BookingRulesFormState, form: FormData): Promise<BookingRulesFormState> {
  const { ctx } = await requireDealerUser();
  const values = readFormValues(form);
  try {
    const result = await updateBookingRules(ctx, toRulesInput(values));
    if (result.ok) return { values: toFormValues(result.rules), saved: true };
    return { values, errors: toFormErrors(result.errors) };
  } catch (err) {
    if (err instanceof ForbiddenError) return { values, error: "forbidden" };
    if (err instanceof DealerReadOnlyError) return { values, error: "readOnly" };
    throw err;
  }
}
