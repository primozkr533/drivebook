"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { DealerReadOnlyError } from "@/server/auth/permissions";
import { createBooking, type BookingError, type BookingField } from "@/server/data/bookings";
import { resolveDealerSlug } from "@/server/data/dealers";
import { BASE_PATH_HEADER } from "@/server/routing";

export type BookingFormValues = Record<"name" | "phone" | "email" | "note", string>;
export type BookingFormState = {
  values?: BookingFormValues;
  errors?: Partial<Record<BookingField, BookingError>>;
  error?: "readOnly" | "carGone";
};

const text = (form: FormData, name: string) => {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
};

// The slug is bound by the page; it only selects the public dealer site, exactly like the host does.
export async function createBookingAction(slug: string, _prev: BookingFormState, form: FormData): Promise<BookingFormState> {
  const values: BookingFormValues = { name: text(form, "name"), phone: text(form, "phone"), email: text(form, "email"), note: text(form, "note") };
  const resolved = await resolveDealerSlug(slug);
  if (resolved.kind !== "current" || resolved.dealer.status !== "active") return { values, error: "readOnly" };
  let result: Awaited<ReturnType<typeof createBooking>>;
  try {
    result = await createBooking(resolved.ctx, {
      ...values,
      carId: text(form, "carId"),
      kind: text(form, "kind"),
      start: text(form, "start"),
    });
  } catch (err) {
    if (err instanceof DealerReadOnlyError) return { values, error: "readOnly" };
    throw err;
  }
  if (!result.ok) return "carNotFound" in result ? { values, error: "carGone" } : { values, errors: result.errors };
  const basePath = (await headers()).get(BASE_PATH_HEADER) ?? "";
  redirect(`${basePath}/rezervacija/${result.bookingId}`);
}
