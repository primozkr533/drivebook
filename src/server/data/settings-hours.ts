import { and, asc, eq, gte, lte } from "drizzle-orm";
import { createTranslator } from "next-intl";
import { dealerClosures, holidayOverrides, openingHours } from "@/db/schema";
import { newPublicId } from "@/db/ids";
import { addDays, daysBetween, isValidDateISO, ljubljanaNow, slovenianWorkFreeDays } from "@/lib/date";
import {
  emptyWeek,
  validateWeek,
  WEEKDAYS,
  type HoursErrorItem,
  type Weekday,
  type WeekHours,
  type WeekHoursInput,
} from "@/lib/opening-hours";
import { DealerReadOnlyError, requireDealerRole } from "@/server/auth/permissions";
import type { DealerContext } from "./context";
import { db } from "./db";
import { withDealerMutation, type AuditEntry, type Tx } from "./mutate";
import holidays from "../../../messages/sl/holidays.json";

const holidayT = createTranslator({ locale: "sl", messages: { holidays }, namespace: "holidays" });

export type { HoursError, HoursErrorItem, TimeRange, Weekday, WeekHours, WeekHoursInput } from "@/lib/opening-hours";
export { MAX_RANGES_PER_DAY, TIME_STEP_MINUTES, validateWeek, WEEKDAYS } from "@/lib/opening-hours";

export type ReplaceOpeningHoursResult = { ok: true; week: WeekHours } | { ok: false; errors: HoursErrorItem[] };

export type HolidayRow = { id: string; date: string; key: string | null; year: number; openAnyway: boolean };

export type Closure = { id: string; startDate: string; endDate: string; reason: string | null };
export type ClosureInput = { startDate: string; endDate?: string | null; reason?: string | null };
export type ClosureField = "startDate" | "endDate" | "reason";
export type ClosureError = "required" | "invalid_date" | "in_past" | "end_before_start" | "too_long";
export type AddClosureResult =
  | { ok: true; closure: Closure }
  | { ok: false; errors: Partial<Record<ClosureField, ClosureError>> };

export type NotFoundResult = { ok: false; error: "not_found" };

export const CLOSURE_MAX_DAYS = 366;
export const CLOSURE_REASON_MAX = 200;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function readWeek(executor: Tx | ReturnType<typeof db>, dealerId: string): Promise<WeekHours> {
  const rows = await executor
    .select({ isoWeekday: openingHours.isoWeekday, opensAt: openingHours.opensAt, closesAt: openingHours.closesAt })
    .from(openingHours)
    .where(eq(openingHours.dealerId, dealerId))
    .orderBy(asc(openingHours.isoWeekday), asc(openingHours.opensAt));
  const week = emptyWeek();
  for (const r of rows) {
    week[r.isoWeekday as Weekday].push({ opens: r.opensAt.slice(0, 5), closes: r.closesAt.slice(0, 5) });
  }
  return week;
}

export async function getOpeningHours(ctx: DealerContext): Promise<WeekHours> {
  await requireDealerRole(ctx, ["owner"]);
  return readWeek(db(), ctx.dealerId);
}

export async function replaceOpeningHours(ctx: DealerContext, week: WeekHoursInput): Promise<ReplaceOpeningHoursResult> {
  const actor = await requireDealerRole(ctx, ["owner"]);
  const validated = validateWeek(week);
  if (!validated.ok) return validated;
  const after = validated.week;

  const audit: AuditEntry = {
    action: "opening_hours.replace",
    entity: "opening_hours",
    entityId: ctx.dealerId,
    actorKind: "dealer_user",
    actorId: actor.userId,
  };
  await withDealerMutation(
    ctx,
    async (tx) => {
      const before = await readWeek(tx, ctx.dealerId);
      await tx.delete(openingHours).where(eq(openingHours.dealerId, ctx.dealerId));
      const rows = WEEKDAYS.flatMap((day) =>
        after[day].map((r) => ({ dealerId: ctx.dealerId, isoWeekday: day, opensAt: r.opens, closesAt: r.closes })),
      );
      if (rows.length > 0) await tx.insert(openingHours).values(rows);
      audit.data = { before, after };
    },
    audit,
  );
  return { ok: true, week: after };
}

function holidayYears(): [number, number] {
  const year = Number(ljubljanaNow().dateISO.slice(0, 4));
  return [year, year + 1];
}

async function readHolidays(dealerId: string, from: number, to: number): Promise<HolidayRow[]> {
  const rows = await db()
    .select({ id: holidayOverrides.id, date: holidayOverrides.date, key: holidayOverrides.key, openAnyway: holidayOverrides.openAnyway })
    .from(holidayOverrides)
    .where(
      and(
        eq(holidayOverrides.dealerId, dealerId),
        gte(holidayOverrides.date, `${from}-01-01`),
        lte(holidayOverrides.date, `${to}-12-31`),
      ),
    )
    .orderBy(asc(holidayOverrides.date));
  return rows.map((r) => ({ ...r, year: Number(r.date.slice(0, 4)) }));
}

export async function listHolidays(ctx: DealerContext): Promise<HolidayRow[]> {
  const actor = await requireDealerRole(ctx, ["owner"]);
  const [from, to] = holidayYears();
  const rows = await readHolidays(ctx.dealerId, from, to);
  const missing = [from, to].filter((year) => !rows.some((r) => r.year === year));
  if (missing.length === 0) return rows;

  const values = missing.flatMap((year) =>
    slovenianWorkFreeDays(year).map((day) => ({
      dealerId: ctx.dealerId,
      date: day.date,
      key: day.key,
      name: holidayT(day.key as keyof typeof holidays),
    })),
  );
  try {
    await withDealerMutation(
      ctx,
      // The (dealer_id, date) unique constraint keeps concurrent first visits from seeding twice.
      (tx) => tx.insert(holidayOverrides).values(values).onConflictDoNothing(),
      {
        action: "holidays.seed",
        entity: "holiday_overrides",
        entityId: ctx.dealerId,
        actorKind: "dealer_user",
        actorId: actor.userId,
        data: { years: missing },
      },
    );
  } catch (error) {
    // A read-only/suspended dealer can still view its holidays; the missing year is just not stored yet.
    if (!(error instanceof DealerReadOnlyError)) throw error;
    return rows;
  }
  return readHolidays(ctx.dealerId, from, to);
}

export async function setHolidayOpenAnyway(
  ctx: DealerContext,
  holidayId: string,
  openAnyway: boolean,
): Promise<{ ok: true; holiday: HolidayRow } | NotFoundResult> {
  const actor = await requireDealerRole(ctx, ["owner"]);
  if (typeof holidayId !== "string" || !UUID_RE.test(holidayId)) return { ok: false, error: "not_found" };
  const value = openAnyway === true;

  const audit: AuditEntry = {
    action: "holiday.open_anyway",
    entity: "holiday_override",
    entityId: holidayId,
    actorKind: "dealer_user",
    actorId: actor.userId,
  };
  const [row] = await db()
    .select({ id: holidayOverrides.id })
    .from(holidayOverrides)
    .where(and(eq(holidayOverrides.id, holidayId), eq(holidayOverrides.dealerId, ctx.dealerId)))
    .limit(1);
  if (!row) return { ok: false, error: "not_found" };

  const updated = await withDealerMutation(
    ctx,
    async (tx) => {
      const [before] = await tx
        .select({ openAnyway: holidayOverrides.openAnyway })
        .from(holidayOverrides)
        .where(and(eq(holidayOverrides.id, holidayId), eq(holidayOverrides.dealerId, ctx.dealerId)))
        .for("update");
      if (!before) return null;
      const [after] = await tx
        .update(holidayOverrides)
        .set({ openAnyway: value, updatedAt: new Date() })
        .where(and(eq(holidayOverrides.id, holidayId), eq(holidayOverrides.dealerId, ctx.dealerId)))
        .returning({ id: holidayOverrides.id, date: holidayOverrides.date, key: holidayOverrides.key, openAnyway: holidayOverrides.openAnyway });
      audit.data = { date: after.date, key: after.key, before: before.openAnyway, after: value };
      return after;
    },
    audit,
  );
  if (!updated) return { ok: false, error: "not_found" };
  return { ok: true, holiday: { ...updated, year: Number(updated.date.slice(0, 4)) } };
}

const closureColumns = {
  id: dealerClosures.id,
  startDate: dealerClosures.startDate,
  endDate: dealerClosures.endDate,
  reason: dealerClosures.reason,
};

export async function listClosures(ctx: DealerContext): Promise<Closure[]> {
  await requireDealerRole(ctx, ["owner"]);
  return db()
    .select(closureColumns)
    .from(dealerClosures)
    .where(eq(dealerClosures.dealerId, ctx.dealerId))
    .orderBy(asc(dealerClosures.startDate), asc(dealerClosures.endDate));
}

export function validateClosure(
  input: ClosureInput,
  today: string = ljubljanaNow().dateISO,
): { ok: true; closure: Omit<Closure, "id"> } | { ok: false; errors: Partial<Record<ClosureField, ClosureError>> } {
  const errors: Partial<Record<ClosureField, ClosureError>> = {};
  const startDate = typeof input.startDate === "string" ? input.startDate.trim() : "";
  const rawEnd = typeof input.endDate === "string" ? input.endDate.trim() : "";
  const endDate = rawEnd === "" ? startDate : rawEnd;
  const rawReason = typeof input.reason === "string" ? input.reason.trim() : "";

  if (startDate === "") errors.startDate = "required";
  else if (!isValidDateISO(startDate)) errors.startDate = "invalid_date";
  else if (startDate < today) errors.startDate = "in_past";

  if (rawEnd !== "" && !isValidDateISO(rawEnd)) errors.endDate = "invalid_date";
  else if (isValidDateISO(startDate)) {
    if (endDate < startDate) errors.endDate = "end_before_start";
    else if (endDate > addDays(startDate, CLOSURE_MAX_DAYS - 1)) errors.endDate = "too_long";
  }

  if (rawReason.length > CLOSURE_REASON_MAX) errors.reason = "too_long";

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, closure: { startDate, endDate, reason: rawReason === "" ? null : rawReason } };
}

export async function addClosure(ctx: DealerContext, input: ClosureInput): Promise<AddClosureResult> {
  const actor = await requireDealerRole(ctx, ["owner"]);
  const validated = validateClosure(input);
  if (!validated.ok) return validated;
  const closure: Closure = { id: newPublicId(), ...validated.closure };

  await withDealerMutation(
    ctx,
    (tx) => tx.insert(dealerClosures).values({ dealerId: ctx.dealerId, ...closure }),
    {
      action: "closure.add",
      entity: "dealer_closure",
      entityId: closure.id,
      actorKind: "dealer_user",
      actorId: actor.userId,
      data: { after: closure, days: daysBetween(closure.startDate, closure.endDate) + 1 },
    },
  );
  return { ok: true, closure };
}

export async function deleteClosure(ctx: DealerContext, closureId: string): Promise<{ ok: true } | NotFoundResult> {
  const actor = await requireDealerRole(ctx, ["owner"]);
  if (typeof closureId !== "string" || closureId === "") return { ok: false, error: "not_found" };

  const audit: AuditEntry = {
    action: "closure.delete",
    entity: "dealer_closure",
    entityId: closureId,
    actorKind: "dealer_user",
    actorId: actor.userId,
  };
  const [row] = await db()
    .select({ id: dealerClosures.id })
    .from(dealerClosures)
    .where(and(eq(dealerClosures.id, closureId), eq(dealerClosures.dealerId, ctx.dealerId)))
    .limit(1);
  if (!row) return { ok: false, error: "not_found" };

  const deleted = await withDealerMutation(
    ctx,
    async (tx) => {
      const [before] = await tx
        .delete(dealerClosures)
        .where(and(eq(dealerClosures.id, closureId), eq(dealerClosures.dealerId, ctx.dealerId)))
        .returning(closureColumns);
      audit.data = { before: before ?? null };
      return before ?? null;
    },
    audit,
  );
  if (!deleted) return { ok: false, error: "not_found" };
  return { ok: true };
}
