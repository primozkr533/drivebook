import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { and, asc, count, eq, gt, gte, lt, ne, or } from "drizzle-orm";
import { bookingRules, bookings, cars, dealers } from "@/db/schema";
import { dealerSiteOrigin, surfaceOrigin } from "@/lib/config";
import { addDays, formatDateShort, formatTime, ljubljanaNow, toLjubljanaParts, zonedToUtc } from "@/lib/date";
import { computeDaySlots, type Interval, type Slot } from "@/lib/slots";
import { requireDealerRole } from "@/server/auth/permissions";
import { sendEmail, sendSms } from "@/server/notify/queue";
import { emailT, layout, senderNameFor } from "@/server/notify/templates/layout";
import { getOpeningRangesBetween } from "./availability";
import type { DealerContext } from "./context";
import { newPublicId } from "@/db/ids";
import { db } from "./db";
import { withDealerMutation, type Tx } from "./mutate";
import { BOOKING_RULE_DEFAULTS } from "./settings-booking";
import { defaultSmsSenderName, normalizePhone } from "./settings-dealer";

export type BookingKind = "test_drive" | "viewing";
export const BOOKING_KINDS: readonly BookingKind[] = ["test_drive", "viewing"];
export type BookingStatus = "pending" | "confirmed" | "cancelled";

// SMS code verification of the customer's phone.
export const VERIFY_CODE_TTL_MINUTES = 10;
export const VERIFY_MAX_ATTEMPTS = 5;
export const VERIFY_MAX_SENDS = 3;
export const VERIFY_RESEND_COOLDOWN_SECONDS = 60;
// Unverified bookings per phone number per hour (each one sends an SMS).
export const UNVERIFIED_PER_PHONE_PER_HOUR = 3;

export const CUSTOMER_NAME_MAX = 100;
export const CUSTOMER_NOTE_MAX = 500;

type Rules = {
  testDriveMinutes: number;
  viewingMinutes: number;
  slotMinutes: number;
  leadTimeMinutes: number;
  maxDaysAhead: number;
  bufferMinutes: number;
  cancelCutoffMinutes: number;
  requirePhoneVerification: boolean;
};

const ruleColumns = {
  testDriveMinutes: bookingRules.testDriveMinutes,
  viewingMinutes: bookingRules.viewingMinutes,
  slotMinutes: bookingRules.slotMinutes,
  leadTimeMinutes: bookingRules.leadTimeMinutes,
  maxDaysAhead: bookingRules.maxDaysAhead,
  bufferMinutes: bookingRules.bufferMinutes,
  cancelCutoffMinutes: bookingRules.cancelCutoffMinutes,
  requirePhoneVerification: bookingRules.requirePhoneVerification,
};

const DEFAULT_RULES: Rules = {
  testDriveMinutes: BOOKING_RULE_DEFAULTS.testDriveMinutes,
  viewingMinutes: BOOKING_RULE_DEFAULTS.viewingMinutes,
  slotMinutes: BOOKING_RULE_DEFAULTS.slotIntervalMinutes,
  leadTimeMinutes: BOOKING_RULE_DEFAULTS.minNoticeMinutes,
  maxDaysAhead: BOOKING_RULE_DEFAULTS.horizonDays,
  bufferMinutes: BOOKING_RULE_DEFAULTS.bufferMinutes,
  cancelCutoffMinutes: BOOKING_RULE_DEFAULTS.cancelCutoffMinutes,
  requirePhoneVerification: true,
};

async function loadRules(ctx: DealerContext, tx?: Tx): Promise<Rules> {
  const [row] = await (tx ?? db()).select(ruleColumns).from(bookingRules).where(eq(bookingRules.dealerId, ctx.dealerId)).limit(1);
  return row ?? DEFAULT_RULES;
}

const durationFor = (rules: Rules, kind: BookingKind) => (kind === "test_drive" ? rules.testDriveMinutes : rules.viewingMinutes);

export function isBookingKind(value: unknown): value is BookingKind {
  return value === "test_drive" || value === "viewing";
}

/** A booking blocks its car while confirmed, or while pending and its SMS code is still valid. */
async function busyIntervals(
  exec: Tx | ReturnType<typeof db>,
  ctx: DealerContext,
  carId: string,
  from: Date,
  to: Date,
  now: Date,
): Promise<Interval[]> {
  const rows = await exec
    .select({ start: bookings.startsAt, end: bookings.endsAt })
    .from(bookings)
    .where(
      and(
        eq(bookings.dealerId, ctx.dealerId),
        eq(bookings.carId, carId),
        or(eq(bookings.status, "confirmed"), and(eq(bookings.status, "pending"), gt(bookings.verifyExpiresAt, now))),
        lt(bookings.startsAt, to),
        gte(bookings.endsAt, from),
      ),
    );
  return rows;
}

export type AvailabilityDay = { date: string; slots: Slot[] };

/**
 * One car's free start times for each day of the booking horizon (today … today + maxDaysAhead).
 * Opening hours, holidays and closures are shared by the whole dealer; bookings only block their own car.
 */
async function computeAvailability(
  exec: Tx | ReturnType<typeof db>,
  ctx: DealerContext,
  carId: string,
  kind: BookingKind,
  now: Date,
  rules: Rules,
  onlyDate?: string,
): Promise<AvailabilityDay[]> {
  const today = ljubljanaNow(now).dateISO;
  const lastDay = addDays(today, rules.maxDaysAhead);
  const from = onlyDate ?? today;
  const to = onlyDate ?? lastDay;
  if (from < today || to > lastDay) return [];
  const ranges = await getOpeningRangesBetween(ctx, from, to);
  const busy = await busyIntervals(exec, ctx, carId, zonedToUtc(from, "00:00"), zonedToUtc(addDays(to, 1), "00:00"), now);
  const earliest = new Date(now.getTime() + rules.leadTimeMinutes * 60_000);
  const slotRules = { durationMinutes: durationFor(rules, kind), stepMinutes: rules.slotMinutes, bufferMinutes: rules.bufferMinutes };
  return [...ranges.entries()].map(([date, dayRanges]) => ({
    date,
    slots: computeDaySlots({ date, ranges: dayRanges, rules: slotRules, earliest, busy }),
  }));
}

export async function getCarAvailability(
  ctx: DealerContext,
  carId: string,
  kind: BookingKind,
  now: Date = new Date(),
): Promise<{ days: AvailabilityDay[]; durationMinutes: number } | null> {
  const [car] = await db()
    .select({ id: cars.id })
    .from(cars)
    .where(and(eq(cars.dealerId, ctx.dealerId), eq(cars.id, carId), eq(cars.active, true)))
    .limit(1);
  if (!car) return null;
  const rules = await loadRules(ctx);
  const days = await computeAvailability(db(), ctx, carId, kind, now, rules);
  return { days, durationMinutes: durationFor(rules, kind) };
}

// ---- Public: create a booking ----

export type BookingField = "kind" | "start" | "name" | "phone" | "email" | "note";
export type BookingError = "required" | "invalid" | "too_long" | "slot_taken" | "too_many";
export type BookingInput = Partial<Record<BookingField | "carId", string>>;

export type CreateBookingResult =
  | { ok: true; bookingId: string; needsVerification: boolean }
  | { ok: false; errors: Partial<Record<BookingField, BookingError>> }
  | { ok: false; carNotFound: true };

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function newBookingCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

function newVerifyCode(): string {
  return String(randomInt(1_000_000)).padStart(6, "0");
}

function hashVerifyCode(bookingId: string, code: string): string {
  return createHash("sha256").update(`${bookingId}:${code}`).digest("hex");
}

function codeMatches(bookingId: string, code: string, hash: string): boolean {
  const a = Buffer.from(hashVerifyCode(bookingId, code), "hex");
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function createBooking(ctx: DealerContext, input: BookingInput, now: Date = new Date()): Promise<CreateBookingResult> {
  const errors: Partial<Record<BookingField, BookingError>> = {};
  const carId = (input.carId ?? "").trim();
  const kind = input.kind;
  if (!isBookingKind(kind)) errors.kind = "required";
  const startRaw = (input.start ?? "").trim();
  const start = startRaw ? new Date(startRaw) : null;
  if (!start) errors.start = "required";
  else if (Number.isNaN(start.getTime())) errors.start = "invalid";
  const name = (input.name ?? "").trim().replace(/\s+/g, " ");
  if (!name) errors.name = "required";
  else if (name.length > CUSTOMER_NAME_MAX) errors.name = "too_long";
  const rawPhone = (input.phone ?? "").trim();
  const phone = rawPhone ? normalizePhone(rawPhone) : null;
  if (!rawPhone) errors.phone = "required";
  else if (!phone) errors.phone = "invalid";
  const email = (input.email ?? "").trim().toLowerCase() || null;
  if (email && (email.length > 254 || !EMAIL_RE.test(email))) errors.email = "invalid";
  const note = (input.note ?? "").trim() || null;
  if (note && note.length > CUSTOMER_NOTE_MAX) errors.note = "too_long";
  if (Object.keys(errors).length > 0 || !start || !phone || !isBookingKind(kind)) return { ok: false, errors };

  const result = await withDealerMutation(
    ctx,
    async (tx) => {
      // Locking the car serialises bookings of the same car, so two customers can't take one slot.
      const [car] = await tx
        .select({ id: cars.id })
        .from(cars)
        .where(and(eq(cars.dealerId, ctx.dealerId), eq(cars.id, carId), eq(cars.active, true)))
        .for("update");
      if (!car) return { carNotFound: true as const };
      const [{ recent }] = await tx
        .select({ recent: count() })
        .from(bookings)
        .where(
          and(
            eq(bookings.dealerId, ctx.dealerId),
            eq(bookings.customerPhone, phone),
            eq(bookings.phoneVerified, false),
            gt(bookings.createdAt, new Date(now.getTime() - 3_600_000)),
          ),
        );
      const rules = await loadRules(ctx, tx);
      if (rules.requirePhoneVerification && recent >= UNVERIFIED_PER_PHONE_PER_HOUR) return { tooMany: true as const };
      const date = toLjubljanaParts(start).dateISO;
      const [day] = await computeAvailability(tx, ctx, carId, kind, now, rules, date);
      const slot = day?.slots.find((s) => s.start.getTime() === start.getTime());
      if (!slot) return { slotTaken: true as const };
      const verify = rules.requirePhoneVerification;
      const id = newPublicId();
      const code = verify ? newVerifyCode() : null;
      const [row] = await tx
        .insert(bookings)
        .values({
          id,
          status: verify ? "pending" : "confirmed",
          createdAt: now,
          ...(code && {
            verifyCodeHash: hashVerifyCode(id, code),
            verifyExpiresAt: new Date(now.getTime() + VERIFY_CODE_TTL_MINUTES * 60_000),
            verifySends: 1,
            verifyLastSentAt: now,
          }),
          dealerId: ctx.dealerId,
          carId,
          kind,
          startsAt: slot.start,
          endsAt: slot.end,
          customerName: name,
          customerPhone: phone,
          customerEmail: email,
          customerNote: note,
          code: newBookingCode(),
        })
        .returning({ id: bookings.id });
      return { bookingId: row.id, code };
    },
    (r) =>
      "bookingId" in r
        ? { action: "booking.create", entity: "booking", entityId: r.bookingId, actorKind: "customer", data: { carId, kind } }
        : { action: "booking.create_refused", entity: "car", entityId: carId, actorKind: "customer", data: { reason: Object.keys(r)[0] } },
  );
  if ("carNotFound" in result) return { ok: false, carNotFound: true };
  if ("slotTaken" in result) return { ok: false, errors: { start: "slot_taken" } };
  if ("tooMany" in result) return { ok: false, errors: { phone: "too_many" } };
  if (result.code) {
    await sendVerifyCode(ctx, result.bookingId, result.code);
    return { ok: true, bookingId: result.bookingId, needsVerification: true };
  }
  await notifyBookingCreated(ctx, result.bookingId);
  return { ok: true, bookingId: result.bookingId, needsVerification: false };
}

// ---- Reads ----

export type BookingView = {
  id: string;
  code: string;
  kind: BookingKind;
  status: BookingStatus;
  startsAt: Date;
  endsAt: Date;
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  customerNote: string | null;
  car: { id: string; make: string; model: string; year: number | null; mileageKm: number | null };
  cancelCutoffMinutes: number;
  phoneVerified: boolean;
  /** Only for a pending booking: the code's state, for the customer's verification form. */
  verification: { expiresAt: Date; expired: boolean; attemptsLeft: number; sendsLeft: number; resendAt: Date } | null;
};

const bookingColumns = {
  id: bookings.id,
  code: bookings.code,
  kind: bookings.kind,
  status: bookings.status,
  startsAt: bookings.startsAt,
  endsAt: bookings.endsAt,
  customerName: bookings.customerName,
  customerPhone: bookings.customerPhone,
  customerEmail: bookings.customerEmail,
  customerNote: bookings.customerNote,
  phoneVerified: bookings.phoneVerified,
  verifyExpiresAt: bookings.verifyExpiresAt,
  verifyAttempts: bookings.verifyAttempts,
  verifySends: bookings.verifySends,
  verifyLastSentAt: bookings.verifyLastSentAt,
  carId: cars.id,
  make: cars.make,
  model: cars.model,
  year: cars.year,
  mileageKm: cars.mileageKm,
};

type BookingRow = {
  id: string;
  code: string;
  kind: BookingKind;
  status: BookingStatus;
  startsAt: Date;
  endsAt: Date;
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  customerNote: string | null;
  phoneVerified: boolean;
  verifyExpiresAt: Date | null;
  verifyAttempts: number;
  verifySends: number;
  verifyLastSentAt: Date | null;
  carId: string;
  make: string;
  model: string;
  year: number | null;
  mileageKm: number | null;
};

function toView(r: BookingRow, rules: Rules, now: Date = new Date()): BookingView {
  const pending = r.status === "pending" && r.verifyExpiresAt !== null;
  return {
    id: r.id,
    code: r.code,
    kind: r.kind,
    status: r.status,
    startsAt: r.startsAt,
    endsAt: r.endsAt,
    customerName: r.customerName,
    customerPhone: r.customerPhone,
    customerEmail: r.customerEmail,
    customerNote: r.customerNote,
    car: { id: r.carId, make: r.make, model: r.model, year: r.year, mileageKm: r.mileageKm },
    cancelCutoffMinutes: rules.cancelCutoffMinutes,
    phoneVerified: r.phoneVerified,
    verification: pending
      ? {
          expiresAt: r.verifyExpiresAt!,
          expired: r.verifyExpiresAt! <= now || r.verifyAttempts >= VERIFY_MAX_ATTEMPTS,
          attemptsLeft: Math.max(0, VERIFY_MAX_ATTEMPTS - r.verifyAttempts),
          sendsLeft: Math.max(0, VERIFY_MAX_SENDS - r.verifySends),
          resendAt: new Date((r.verifyLastSentAt ?? now).getTime() + VERIFY_RESEND_COOLDOWN_SECONDS * 1000),
        }
      : null,
  };
}

/** The confirmation page reads a booking by its unguessable id, scoped to the dealer of the host. */
export async function getPublicBooking(ctx: DealerContext, bookingId: string, now: Date = new Date()): Promise<BookingView | null> {
  const [row] = await db()
    .select(bookingColumns)
    .from(bookings)
    .innerJoin(cars, eq(cars.id, bookings.carId))
    .where(and(eq(bookings.dealerId, ctx.dealerId), eq(bookings.id, bookingId)))
    .limit(1);
  if (!row) return null;
  return toView(row, await loadRules(ctx), now);
}

// ---- Dealer admin ----

const BOOKING_ROLES = ["owner", "salesperson"] as const;

export async function listBookings(
  ctx: DealerContext,
  { fromDate, days = 31, carId }: { fromDate: string; days?: number; carId?: string },
): Promise<BookingView[]> {
  await requireDealerRole(ctx, [...BOOKING_ROLES]);
  const from = zonedToUtc(fromDate, "00:00");
  const to = zonedToUtc(addDays(fromDate, days), "00:00");
  const [rows, rules] = await Promise.all([
    db()
      .select(bookingColumns)
      .from(bookings)
      .innerJoin(cars, eq(cars.id, bookings.carId))
      .where(
        and(
          eq(bookings.dealerId, ctx.dealerId),
          // Unverified bookings are not real yet; the dealer sees them once the customer enters the SMS code.
          ne(bookings.status, "pending"),
          gte(bookings.startsAt, from),
          lt(bookings.startsAt, to),
          carId ? eq(bookings.carId, carId) : undefined,
        ),
      )
      .orderBy(asc(bookings.startsAt)),
    loadRules(ctx),
  ]);
  return rows.map((r) => toView(r, rules));
}

export type CancelBookingResult = { ok: true } | { ok: false; notFound: true } | { ok: false; alreadyCancelled: true };

export async function cancelBooking(ctx: DealerContext, bookingId: string): Promise<CancelBookingResult> {
  const actor = await requireDealerRole(ctx, [...BOOKING_ROLES]);
  const result = await withDealerMutation(
    ctx,
    async (tx): Promise<CancelBookingResult> => {
      const [row] = await tx
        .select({ status: bookings.status })
        .from(bookings)
        .where(and(eq(bookings.dealerId, ctx.dealerId), eq(bookings.id, bookingId)))
        .for("update");
      if (!row || row.status === "pending") return { ok: false, notFound: true };
      if (row.status === "cancelled") return { ok: false, alreadyCancelled: true };
      await tx
        .update(bookings)
        .set({ status: "cancelled", cancelledAt: new Date(), updatedAt: new Date() })
        .where(and(eq(bookings.dealerId, ctx.dealerId), eq(bookings.id, bookingId), ne(bookings.status, "cancelled")));
      return { ok: true };
    },
    (r) => ({
      action: r.ok ? "booking.cancel" : "booking.cancel_refused",
      entity: "booking",
      entityId: bookingId,
      actorKind: "dealer_user",
      actorId: actor.userId,
    }),
  );
  if (result.ok) await notifyBookingCancelled(ctx, bookingId);
  return result;
}

// ---- Public: SMS code verification ----

export type VerifyBookingResult =
  | { ok: true }
  | { ok: false; error: "not_found" }
  | { ok: false; error: "wrong_code"; attemptsLeft: number }
  | { ok: false; error: "expired" };

/** Confirms a pending booking with the SMS code. Wrong codes count; after VERIFY_MAX_ATTEMPTS the slot is released. */
export async function verifyBooking(ctx: DealerContext, bookingId: string, rawCode: string, now: Date = new Date()): Promise<VerifyBookingResult> {
  const code = rawCode.replace(/\s+/g, "");
  const result = await withDealerMutation(
    ctx,
    async (tx): Promise<VerifyBookingResult & { confirmedNow?: boolean }> => {
      const [row] = await tx
        .select({
          status: bookings.status,
          hash: bookings.verifyCodeHash,
          expiresAt: bookings.verifyExpiresAt,
          attempts: bookings.verifyAttempts,
        })
        .from(bookings)
        .where(and(eq(bookings.dealerId, ctx.dealerId), eq(bookings.id, bookingId)))
        .for("update");
      if (!row) return { ok: false, error: "not_found" };
      if (row.status === "confirmed") return { ok: true };
      if (row.status !== "pending" || !row.hash || !row.expiresAt) return { ok: false, error: "expired" };
      if (row.expiresAt <= now || row.attempts >= VERIFY_MAX_ATTEMPTS) return { ok: false, error: "expired" };
      if (!/^\d{6}$/.test(code) || !codeMatches(bookingId, code, row.hash)) {
        const attempts = row.attempts + 1;
        // The last wrong attempt also ends the hold, so the slot is free for others again.
        await tx
          .update(bookings)
          .set({ verifyAttempts: attempts, ...(attempts >= VERIFY_MAX_ATTEMPTS && { verifyExpiresAt: now }), updatedAt: now })
          .where(eq(bookings.id, bookingId));
        return attempts >= VERIFY_MAX_ATTEMPTS
          ? { ok: false, error: "expired" }
          : { ok: false, error: "wrong_code", attemptsLeft: VERIFY_MAX_ATTEMPTS - attempts };
      }
      await tx
        .update(bookings)
        .set({ status: "confirmed", phoneVerified: true, verifyCodeHash: null, updatedAt: now })
        .where(eq(bookings.id, bookingId));
      return { ok: true, confirmedNow: true };
    },
    (r) => ({
      action: r.ok ? "booking.verify" : "booking.verify_failed",
      entity: "booking",
      entityId: bookingId,
      actorKind: "customer",
      ...(!r.ok && { data: { error: r.error } }),
    }),
  );
  // Notify only on the transition to confirmed, not on a repeated submit of a confirmed booking.
  if (!result.ok) return result;
  if (result.confirmedNow) await notifyBookingCreated(ctx, bookingId);
  return { ok: true };
}

export type ResendCodeResult = { ok: true } | { ok: false; error: "not_found" | "expired" | "too_soon" | "limit" };

export async function resendVerifyCode(ctx: DealerContext, bookingId: string, now: Date = new Date()): Promise<ResendCodeResult> {
  const result = await withDealerMutation(
    ctx,
    async (tx): Promise<{ ok: true; code: string } | { ok: false; error: "not_found" | "expired" | "too_soon" | "limit" }> => {
      const [row] = await tx
        .select({
          status: bookings.status,
          expiresAt: bookings.verifyExpiresAt,
          attempts: bookings.verifyAttempts,
          sends: bookings.verifySends,
          lastSentAt: bookings.verifyLastSentAt,
        })
        .from(bookings)
        .where(and(eq(bookings.dealerId, ctx.dealerId), eq(bookings.id, bookingId)))
        .for("update");
      if (!row) return { ok: false, error: "not_found" };
      if (row.status !== "pending" || !row.expiresAt || row.expiresAt <= now || row.attempts >= VERIFY_MAX_ATTEMPTS) {
        return { ok: false, error: "expired" };
      }
      if (row.sends >= VERIFY_MAX_SENDS) return { ok: false, error: "limit" };
      if (row.lastSentAt && now.getTime() - row.lastSentAt.getTime() < VERIFY_RESEND_COOLDOWN_SECONDS * 1000) {
        return { ok: false, error: "too_soon" };
      }
      const code = newVerifyCode();
      await tx
        .update(bookings)
        .set({
          verifyCodeHash: hashVerifyCode(bookingId, code),
          verifyExpiresAt: new Date(now.getTime() + VERIFY_CODE_TTL_MINUTES * 60_000),
          verifySends: row.sends + 1,
          verifyLastSentAt: now,
          updatedAt: now,
        })
        .where(eq(bookings.id, bookingId));
      return { ok: true, code };
    },
    (r) => ({ action: r.ok ? "booking.code_resend" : "booking.code_resend_refused", entity: "booking", entityId: bookingId, actorKind: "customer" }),
  );
  if (!result.ok) return result;
  await sendVerifyCode(ctx, bookingId, result.code);
  return { ok: true };
}

// ---- Notifications (after commit; sendEmail/sendSms never throw) ----

async function loadNotifyData(ctx: DealerContext, bookingId: string) {
  const [row] = await db()
    .select({
      ...bookingColumns,
      dealerName: dealers.name,
      dealerEmail: dealers.email,
      dealerSlug: dealers.slug,
      smsSenderName: dealers.smsSenderName,
      smsNotificationsEnabled: dealers.smsNotificationsEnabled,
      notificationPhone: dealers.notificationPhone,
    })
    .from(bookings)
    .innerJoin(cars, eq(cars.id, bookings.carId))
    .innerJoin(dealers, eq(dealers.id, bookings.dealerId))
    .where(and(eq(bookings.dealerId, ctx.dealerId), eq(bookings.id, bookingId)))
    .limit(1);
  return row ?? null;
}

function bookingFacts(row: NonNullable<Awaited<ReturnType<typeof loadNotifyData>>>) {
  return {
    dealerName: row.dealerName,
    car: `${row.make} ${row.model}`,
    kind: emailT(`booking.kind.${row.kind}`),
    date: formatDateShort(row.startsAt),
    time: formatTime(row.startsAt),
    code: row.code,
  };
}

async function sendVerifyCode(ctx: DealerContext, bookingId: string, code: string): Promise<void> {
  try {
    const row = await loadNotifyData(ctx, bookingId);
    if (!row) return;
    await sendSms({
      to: row.customerPhone,
      body: emailT("booking.smsVerifyCode", { dealerName: row.dealerName, code, minutes: VERIFY_CODE_TTL_MINUTES }),
      alphaSender: row.smsSenderName || defaultSmsSenderName(row.dealerName),
      dealerId: ctx.dealerId,
      template: "booking_verify_code",
    });
  } catch (error) {
    console.error("[bookings] Could not send verification code", error);
  }
}

async function notifyBookingCreated(ctx: DealerContext, bookingId: string): Promise<void> {
  try {
    const row = await loadNotifyData(ctx, bookingId);
    if (!row) return;
    const facts = bookingFacts(row);
    const alphaSender = row.smsSenderName || defaultSmsSenderName(row.dealerName);
    const confirmationLink = `${dealerSiteOrigin(row.dealerSlug)}/rezervacija/${row.id}`;
    await sendSms({
      to: row.customerPhone,
      body: emailT("booking.smsCustomerCreated", { ...facts, link: confirmationLink }),
      alphaSender,
      dealerId: ctx.dealerId,
      template: "booking_created_customer",
    });
    if (row.dealerEmail.trim()) {
      const email = layout({
        subject: emailT("booking.dealerSubject", facts),
        senderName: senderNameFor(),
        recipientEmail: row.dealerEmail,
        heading: emailT("booking.dealerHeading"),
        paragraphs: [
          emailT("booking.dealerWhat", facts),
          emailT("booking.dealerCustomer", { name: row.customerName, phone: row.customerPhone, email: row.customerEmail ?? "—" }),
          ...(row.customerNote ? [emailT("booking.dealerNote", { note: row.customerNote })] : []),
        ],
        buttonLabel: emailT("booking.dealerButton"),
        link: `${surfaceOrigin("dealer")}/bookings`,
      });
      await sendEmail({ ...email, to: row.dealerEmail, dealerId: ctx.dealerId, template: "booking_created_dealer" });
    }
    if (row.smsNotificationsEnabled && row.notificationPhone) {
      await sendSms({
        to: row.notificationPhone,
        body: emailT("booking.smsDealerCreated", { ...facts, name: row.customerName, phone: row.customerPhone }),
        dealerId: ctx.dealerId,
        template: "booking_created_dealer",
      });
    }
  } catch (error) {
    console.error("[bookings] Could not send booking notifications", error);
  }
}

async function notifyBookingCancelled(ctx: DealerContext, bookingId: string): Promise<void> {
  try {
    const row = await loadNotifyData(ctx, bookingId);
    if (!row) return;
    await sendSms({
      to: row.customerPhone,
      body: emailT("booking.smsCustomerCancelled", bookingFacts(row)),
      alphaSender: row.smsSenderName || defaultSmsSenderName(row.dealerName),
      dealerId: ctx.dealerId,
      template: "booking_cancelled_customer",
    });
  } catch (error) {
    console.error("[bookings] Could not send cancellation notification", error);
  }
}
