import { randomInt } from "node:crypto";
import { and, asc, eq, gte, inArray, lt, ne } from "drizzle-orm";
import { bookingRules, bookings, cars, dealers } from "@/db/schema";
import { dealerSiteOrigin, surfaceOrigin } from "@/lib/config";
import { addDays, formatDateShort, formatTime, ljubljanaNow, toLjubljanaParts, zonedToUtc } from "@/lib/date";
import { computeDaySlots, type Interval, type Slot } from "@/lib/slots";
import { requireDealerRole } from "@/server/auth/permissions";
import { sendEmail, sendSms } from "@/server/notify/queue";
import { emailT, layout, senderNameFor } from "@/server/notify/templates/layout";
import { getOpeningRangesBetween } from "./availability";
import type { DealerContext } from "./context";
import { db } from "./db";
import { withDealerMutation, type Tx } from "./mutate";
import { BOOKING_RULE_DEFAULTS } from "./settings-booking";
import { defaultSmsSenderName, normalizePhone } from "./settings-dealer";

export type BookingKind = "test_drive" | "viewing";
export const BOOKING_KINDS: readonly BookingKind[] = ["test_drive", "viewing"];
export type BookingStatus = "confirmed" | "cancelled";

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
};

const ruleColumns = {
  testDriveMinutes: bookingRules.testDriveMinutes,
  viewingMinutes: bookingRules.viewingMinutes,
  slotMinutes: bookingRules.slotMinutes,
  leadTimeMinutes: bookingRules.leadTimeMinutes,
  maxDaysAhead: bookingRules.maxDaysAhead,
  bufferMinutes: bookingRules.bufferMinutes,
  cancelCutoffMinutes: bookingRules.cancelCutoffMinutes,
};

const DEFAULT_RULES: Rules = {
  testDriveMinutes: BOOKING_RULE_DEFAULTS.testDriveMinutes,
  viewingMinutes: BOOKING_RULE_DEFAULTS.viewingMinutes,
  slotMinutes: BOOKING_RULE_DEFAULTS.slotIntervalMinutes,
  leadTimeMinutes: BOOKING_RULE_DEFAULTS.minNoticeMinutes,
  maxDaysAhead: BOOKING_RULE_DEFAULTS.horizonDays,
  bufferMinutes: BOOKING_RULE_DEFAULTS.bufferMinutes,
  cancelCutoffMinutes: BOOKING_RULE_DEFAULTS.cancelCutoffMinutes,
};

async function loadRules(ctx: DealerContext, tx?: Tx): Promise<Rules> {
  const [row] = await (tx ?? db()).select(ruleColumns).from(bookingRules).where(eq(bookingRules.dealerId, ctx.dealerId)).limit(1);
  return row ?? DEFAULT_RULES;
}

const durationFor = (rules: Rules, kind: BookingKind) => (kind === "test_drive" ? rules.testDriveMinutes : rules.viewingMinutes);

export function isBookingKind(value: unknown): value is BookingKind {
  return value === "test_drive" || value === "viewing";
}

async function busyIntervals(exec: Tx | ReturnType<typeof db>, ctx: DealerContext, carId: string, from: Date, to: Date): Promise<Interval[]> {
  const rows = await exec
    .select({ start: bookings.startsAt, end: bookings.endsAt })
    .from(bookings)
    .where(
      and(
        eq(bookings.dealerId, ctx.dealerId),
        eq(bookings.carId, carId),
        eq(bookings.status, "confirmed"),
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
  const busy = await busyIntervals(exec, ctx, carId, zonedToUtc(from, "00:00"), zonedToUtc(addDays(to, 1), "00:00"));
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
export type BookingError = "required" | "invalid" | "too_long" | "slot_taken";
export type BookingInput = Partial<Record<BookingField | "carId", string>>;

export type CreateBookingResult =
  | { ok: true; bookingId: string }
  | { ok: false; errors: Partial<Record<BookingField, BookingError>> }
  | { ok: false; carNotFound: true };

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function newBookingCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
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
      const rules = await loadRules(ctx, tx);
      const date = toLjubljanaParts(start).dateISO;
      const [day] = await computeAvailability(tx, ctx, carId, kind, now, rules, date);
      const slot = day?.slots.find((s) => s.start.getTime() === start.getTime());
      if (!slot) return { slotTaken: true as const };
      const [row] = await tx
        .insert(bookings)
        .values({
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
      return { bookingId: row.id };
    },
    (r) =>
      "bookingId" in r
        ? { action: "booking.create", entity: "booking", entityId: r.bookingId, actorKind: "customer", data: { carId, kind } }
        : { action: "booking.create_refused", entity: "car", entityId: carId, actorKind: "customer" },
  );
  if ("carNotFound" in result) return { ok: false, carNotFound: true };
  if ("slotTaken" in result) return { ok: false, errors: { start: "slot_taken" } };
  await notifyBookingCreated(ctx, result.bookingId);
  return { ok: true, bookingId: result.bookingId };
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
  carId: string;
  make: string;
  model: string;
  year: number | null;
  mileageKm: number | null;
};

function toView(r: BookingRow, rules: Rules): BookingView {
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
  };
}

/** The confirmation page reads a booking by its unguessable id, scoped to the dealer of the host. */
export async function getPublicBooking(ctx: DealerContext, bookingId: string): Promise<BookingView | null> {
  const [row] = await db()
    .select(bookingColumns)
    .from(bookings)
    .innerJoin(cars, eq(cars.id, bookings.carId))
    .where(and(eq(bookings.dealerId, ctx.dealerId), eq(bookings.id, bookingId)))
    .limit(1);
  if (!row) return null;
  return toView(row, await loadRules(ctx));
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
      if (!row) return { ok: false, notFound: true };
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

/** Number of upcoming confirmed bookings per car (admin car list). */
export async function countUpcomingBookingsByCar(ctx: DealerContext, carIds: string[], now: Date = new Date()): Promise<Map<string, number>> {
  await requireDealerRole(ctx, [...BOOKING_ROLES]);
  if (carIds.length === 0) return new Map();
  const rows = await db()
    .select({ carId: bookings.carId })
    .from(bookings)
    .where(
      and(
        eq(bookings.dealerId, ctx.dealerId),
        inArray(bookings.carId, carIds),
        eq(bookings.status, "confirmed"),
        gte(bookings.startsAt, now),
      ),
    );
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.carId, (map.get(r.carId) ?? 0) + 1);
  return map;
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
