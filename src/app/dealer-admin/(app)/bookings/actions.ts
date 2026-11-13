"use server";

import { refresh } from "next/cache";
import { notFound } from "next/navigation";
import { DealerReadOnlyError, ForbiddenError, requireDealerUser } from "@/server/auth/permissions";
import { cancelBooking } from "@/server/data/bookings";

export type CancelBookingError = "forbidden" | "readOnly" | "alreadyCancelled";
export type CancelBookingState = { error?: CancelBookingError };

export async function cancelBookingAction(_prev: CancelBookingState, form: FormData): Promise<CancelBookingState> {
  const { ctx } = await requireDealerUser();
  const id = form.get("id");
  let result: Awaited<ReturnType<typeof cancelBooking>>;
  try {
    result = await cancelBooking(ctx, typeof id === "string" ? id : "");
  } catch (err) {
    if (err instanceof ForbiddenError) return { error: "forbidden" };
    if (err instanceof DealerReadOnlyError) return { error: "readOnly" };
    throw err;
  }
  if ("notFound" in result) notFound();
  if ("alreadyCancelled" in result) return { error: "alreadyCancelled" };
  refresh();
  return {};
}
