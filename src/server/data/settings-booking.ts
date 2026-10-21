import { eq } from "drizzle-orm";
import { bookingRules } from "@/db/schema";
import { requireDealerRole } from "@/server/auth/permissions";
import type { DealerContext } from "./context";
import { db } from "./db";
import { withDealerMutation, type AuditEntry } from "./mutate";

export type BookingRules = {
  testDriveMinutes: number;
  viewingMinutes: number;
  otherMinutes: number;
  capacity: number;
  minNoticeMinutes: number;
  horizonDays: number;
  bufferMinutes: number;
  cancelCutoffMinutes: number;
  slotIntervalMinutes: number;
};

export type BookingRuleField = keyof BookingRules;
export type BookingRuleError = "required" | "not_integer" | "out_of_range" | "invalid_step";
export type BookingRuleLimit = { min: number; max: number; step?: number; options?: readonly number[] };

export type BookingRulesInput = Partial<Record<BookingRuleField, unknown>>;
export type UpdateBookingRulesResult =
  | { ok: true; rules: BookingRules }
  | { ok: false; errors: Partial<Record<BookingRuleField, BookingRuleError>> };

export const BOOKING_RULE_DEFAULTS: Readonly<BookingRules> = Object.freeze({
  testDriveMinutes: 45,
  viewingMinutes: 30,
  otherMinutes: 30,
  capacity: 1,
  minNoticeMinutes: 120,
  horizonDays: 14,
  bufferMinutes: 15,
  cancelCutoffMinutes: 120,
  slotIntervalMinutes: 15,
});

export const BOOKING_RULE_LIMITS: Readonly<Record<BookingRuleField, BookingRuleLimit>> = Object.freeze({
  testDriveMinutes: { min: 15, max: 240, step: 5 },
  viewingMinutes: { min: 10, max: 240, step: 5 },
  otherMinutes: { min: 10, max: 240, step: 5 },
  capacity: { min: 1, max: 20 },
  minNoticeMinutes: { min: 0, max: 10080 },
  horizonDays: { min: 1, max: 180 },
  bufferMinutes: { min: 0, max: 120 },
  cancelCutoffMinutes: { min: 0, max: 10080 },
  slotIntervalMinutes: { min: 5, max: 60, options: [5, 10, 15, 20, 30, 60] },
});

const FIELDS = Object.keys(BOOKING_RULE_DEFAULTS) as BookingRuleField[];

const columns = {
  testDriveMinutes: bookingRules.testDriveMinutes,
  viewingMinutes: bookingRules.viewingMinutes,
  otherMinutes: bookingRules.otherMinutes,
  capacity: bookingRules.capacity,
  minNoticeMinutes: bookingRules.leadTimeMinutes,
  horizonDays: bookingRules.maxDaysAhead,
  bufferMinutes: bookingRules.bufferMinutes,
  cancelCutoffMinutes: bookingRules.cancelCutoffMinutes,
  slotIntervalMinutes: bookingRules.slotMinutes,
};

function toRow(rules: BookingRules) {
  return {
    testDriveMinutes: rules.testDriveMinutes,
    viewingMinutes: rules.viewingMinutes,
    otherMinutes: rules.otherMinutes,
    capacity: rules.capacity,
    leadTimeMinutes: rules.minNoticeMinutes,
    maxDaysAhead: rules.horizonDays,
    bufferMinutes: rules.bufferMinutes,
    cancelCutoffMinutes: rules.cancelCutoffMinutes,
    slotMinutes: rules.slotIntervalMinutes,
  };
}

function validateField(field: BookingRuleField, raw: unknown): number | BookingRuleError {
  if (raw === undefined || raw === null || (typeof raw === "string" && raw.trim() === "")) return "required";
  const value = typeof raw === "string" ? Number(raw.trim()) : raw;
  if (typeof value !== "number" || !Number.isSafeInteger(value)) return "not_integer";
  const limit = BOOKING_RULE_LIMITS[field];
  if (value < limit.min || value > limit.max) return "out_of_range";
  if (limit.options && !limit.options.includes(value)) return "invalid_step";
  if (limit.step && value % limit.step !== 0) return "invalid_step";
  return value;
}

export function validateBookingRules(
  input: BookingRulesInput,
): { ok: true; rules: BookingRules } | { ok: false; errors: Partial<Record<BookingRuleField, BookingRuleError>> } {
  const errors: Partial<Record<BookingRuleField, BookingRuleError>> = {};
  const rules = {} as BookingRules;
  for (const field of FIELDS) {
    const result = validateField(field, input[field]);
    if (typeof result === "number") rules[field] = result;
    else errors[field] = result;
  }
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, rules };
}

export async function getBookingRules(ctx: DealerContext): Promise<BookingRules> {
  await requireDealerRole(ctx, ["owner"]);
  const [row] = await db().select(columns).from(bookingRules).where(eq(bookingRules.dealerId, ctx.dealerId)).limit(1);
  return row ?? { ...BOOKING_RULE_DEFAULTS };
}

export async function updateBookingRules(ctx: DealerContext, input: BookingRulesInput): Promise<UpdateBookingRulesResult> {
  const actor = await requireDealerRole(ctx, ["owner"]);
  const validated = validateBookingRules(input);
  if (!validated.ok) return validated;
  const after = validated.rules;

  const audit: AuditEntry = {
    action: "booking_rules.update",
    entity: "booking_rules",
    entityId: ctx.dealerId,
    actorKind: "dealer_user",
    actorId: actor.userId,
  };
  await withDealerMutation(
    ctx,
    async (tx) => {
      const [before] = await tx
        .select(columns)
        .from(bookingRules)
        .where(eq(bookingRules.dealerId, ctx.dealerId))
        .for("update");
      await tx
        .insert(bookingRules)
        .values({ dealerId: ctx.dealerId, ...toRow(after) })
        .onConflictDoUpdate({ target: bookingRules.dealerId, set: { ...toRow(after), updatedAt: new Date() } });
      // withDealerMutation writes the audit entry after fn, so the before values read here are included.
      audit.data = { before: before ?? null, after };
    },
    audit,
  );
  return { ok: true, rules: after };
}
