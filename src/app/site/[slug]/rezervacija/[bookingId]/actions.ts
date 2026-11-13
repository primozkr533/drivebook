"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { DealerReadOnlyError } from "@/server/auth/permissions";
import { resendVerifyCode, verifyBooking } from "@/server/data/bookings";
import { resolveDealerSlug } from "@/server/data/dealers";
import { BASE_PATH_HEADER } from "@/server/routing";

export type VerifyState = {
  error?: "wrong_code" | "expired" | "unavailable";
  attemptsLeft?: number;
  resent?: "ok" | "too_soon" | "limit" | "expired";
};

async function dealerFor(slug: string) {
  const resolved = await resolveDealerSlug(slug);
  return resolved.kind === "current" && resolved.dealer.status === "active" ? resolved.ctx : null;
}

// slug and bookingId are bound by the page: the slug selects the public site (as the host does), the id is unguessable.
export async function verifyBookingAction(slug: string, bookingId: string, _prev: VerifyState, form: FormData): Promise<VerifyState> {
  const ctx = await dealerFor(slug);
  if (!ctx) return { error: "unavailable" };
  const code = form.get("code");
  let result: Awaited<ReturnType<typeof verifyBooking>>;
  try {
    result = await verifyBooking(ctx, bookingId, typeof code === "string" ? code : "");
  } catch (err) {
    if (err instanceof DealerReadOnlyError) return { error: "unavailable" };
    throw err;
  }
  if (!result.ok) {
    if (result.error === "wrong_code") return { error: "wrong_code", attemptsLeft: result.attemptsLeft };
    if (result.error === "not_found") return { error: "unavailable" };
    redirect(`${(await headers()).get(BASE_PATH_HEADER) ?? ""}/rezervacija/${bookingId}`);
  }
  redirect(`${(await headers()).get(BASE_PATH_HEADER) ?? ""}/rezervacija/${bookingId}`);
}

export async function resendCodeAction(slug: string, bookingId: string, _prev: VerifyState): Promise<VerifyState> {
  const ctx = await dealerFor(slug);
  if (!ctx) return { error: "unavailable" };
  let result: Awaited<ReturnType<typeof resendVerifyCode>>;
  try {
    result = await resendVerifyCode(ctx, bookingId);
  } catch (err) {
    if (err instanceof DealerReadOnlyError) return { error: "unavailable" };
    throw err;
  }
  if (result.ok) return { resent: "ok" };
  if (result.error === "expired") redirect(`${(await headers()).get(BASE_PATH_HEADER) ?? ""}/rezervacija/${bookingId}`);
  return result.error === "not_found" ? { error: "unavailable" } : { resent: result.error };
}
