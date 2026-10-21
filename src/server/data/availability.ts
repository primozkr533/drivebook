import { and, asc, eq, gte, lte } from "drizzle-orm";
import { dealerClosures, holidayOverrides } from "@/db/schema";
import { addDays, daysBetween, isoWeekday, slovenianWorkFreeDays } from "@/lib/date";
import type { DealerContext } from "./context";
import { db } from "./db";
import { listOpeningHours } from "./hours";

export type ClosedReason = "holiday" | "closure";

export type DealerClosedState = {
  closed: boolean;
  reason: ClosedReason | null;
  holidayKey?: string;
  closureReason?: string | null;
};

export type ClosedDate = {
  date: string;
  reason: ClosedReason;
  holidayKey?: string;
  closureReason?: string | null;
};

export type OpeningRange = { opens: string; closes: string };

export const MAX_CLOSED_RANGE_DAYS = 366;

type HolidayDay = { closed: boolean; key: string | null; opens: string | null; closes: string | null };

async function loadDays(ctx: DealerContext, from: string, to: string) {
  const days = daysBetween(from, to) + 1;
  if (days < 1) throw new Error(`Invalid range: ${from} > ${to}`);
  if (days > MAX_CLOSED_RANGE_DAYS) throw new Error(`Range longer than ${MAX_CLOSED_RANGE_DAYS} days`);

  const fromYear = Number(from.slice(0, 4));
  const toYear = Number(to.slice(0, 4));
  // Whole years are loaded so a year with no rows at all can fall back to the computed holidays.
  const [rows, closures] = await Promise.all([
    db()
      .select({
        date: holidayOverrides.date,
        key: holidayOverrides.key,
        openAnyway: holidayOverrides.openAnyway,
        opensAt: holidayOverrides.opensAt,
        closesAt: holidayOverrides.closesAt,
      })
      .from(holidayOverrides)
      .where(
        and(
          eq(holidayOverrides.dealerId, ctx.dealerId),
          gte(holidayOverrides.date, `${fromYear}-01-01`),
          lte(holidayOverrides.date, `${toYear}-12-31`),
        ),
      ),
    db()
      .select({ startDate: dealerClosures.startDate, endDate: dealerClosures.endDate, reason: dealerClosures.reason })
      .from(dealerClosures)
      .where(
        and(
          eq(dealerClosures.dealerId, ctx.dealerId),
          lte(dealerClosures.startDate, to),
          gte(dealerClosures.endDate, from),
        ),
      )
      .orderBy(asc(dealerClosures.startDate), asc(dealerClosures.endDate)),
  ]);

  const holidays = new Map<string, HolidayDay>();
  const yearsWithRows = new Set<number>();
  for (const r of rows) {
    yearsWithRows.add(Number(r.date.slice(0, 4)));
    holidays.set(r.date, {
      closed: !r.openAnyway,
      key: r.key,
      opens: r.opensAt && r.opensAt.slice(0, 5),
      closes: r.closesAt && r.closesAt.slice(0, 5),
    });
  }
  for (let year = fromYear; year <= toYear; year++) {
    if (yearsWithRows.has(year)) continue;
    for (const d of slovenianWorkFreeDays(year)) {
      holidays.set(d.date, { closed: true, key: d.key, opens: null, closes: null });
    }
  }

  return { days, holidays, closures };
}

function closedOn(
  date: string,
  holidays: Map<string, HolidayDay>,
  closures: { startDate: string; endDate: string; reason: string | null }[],
): ClosedDate | null {
  const holiday = holidays.get(date);
  if (holiday?.closed) {
    return holiday.key === null ? { date, reason: "holiday" } : { date, reason: "holiday", holidayKey: holiday.key };
  }
  const closure = closures.find((c) => c.startDate <= date && date <= c.endDate);
  if (closure) return { date, reason: "closure", closureReason: closure.reason };
  return null;
}

export async function getClosedDatesBetween(ctx: DealerContext, from: string, to: string): Promise<ClosedDate[]> {
  const { days, holidays, closures } = await loadDays(ctx, from, to);
  const result: ClosedDate[] = [];
  for (let i = 0; i < days; i++) {
    const closed = closedOn(addDays(from, i), holidays, closures);
    if (closed) result.push(closed);
  }
  return result;
}

export async function isDealerClosed(ctx: DealerContext, date: string): Promise<DealerClosedState> {
  const [closed] = await getClosedDatesBetween(ctx, date, date);
  if (!closed) return { closed: false, reason: null };
  return {
    closed: true,
    reason: closed.reason,
    ...(closed.holidayKey !== undefined && { holidayKey: closed.holidayKey }),
    ...(closed.reason === "closure" && { closureReason: closed.closureReason }),
  };
}

export async function getOpeningRangesForDate(ctx: DealerContext, date: string): Promise<OpeningRange[]> {
  const weekday = isoWeekday(date);
  const [{ holidays, closures }, hours] = await Promise.all([loadDays(ctx, date, date), listOpeningHours(ctx)]);
  if (closedOn(date, holidays, closures)) return [];
  const holiday = holidays.get(date);
  // An open-anyway holiday may carry its own hours for the day instead of the weekday's.
  if (holiday?.opens && holiday.closes) return [{ opens: holiday.opens, closes: holiday.closes }];
  return hours.filter((h) => h.isoWeekday === weekday).map((h) => ({ opens: h.opensAt, closes: h.closesAt }));
}
