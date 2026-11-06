import { timeToMinutes, zonedToUtc } from "./date";

export type Interval = { start: Date; end: Date };
export type Slot = { start: Date; end: Date; label: string };

export type SlotRules = {
  durationMinutes: number;
  stepMinutes: number;
  bufferMinutes: number;
};

const MINUTE = 60_000;
const pad2 = (n: number) => String(n).padStart(2, "0");
const hhmm = (minutes: number) => `${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}`;

/**
 * Bookable start times for one car on one Ljubljana day.
 * - Starts step from each opening range's start; the whole visit must end by the range's close.
 * - A start before `earliest` (now + minimum notice) is dropped.
 * - The car's existing bookings block their time plus the buffer on both sides, so two visits of
 *   the same car are always at least `bufferMinutes` apart. Other cars never block each other.
 */
export function computeDaySlots({
  date,
  ranges,
  rules,
  earliest,
  busy,
}: {
  date: string;
  ranges: { opens: string; closes: string }[];
  rules: SlotRules;
  earliest: Date;
  busy: Interval[];
}): Slot[] {
  const slots: Slot[] = [];
  const buffer = rules.bufferMinutes * MINUTE;
  for (const range of ranges) {
    const opens = timeToMinutes(range.opens);
    const closes = timeToMinutes(range.closes);
    for (let m = opens; m + rules.durationMinutes <= closes; m += rules.stepMinutes) {
      const start = zonedToUtc(date, hhmm(m));
      const end = new Date(start.getTime() + rules.durationMinutes * MINUTE);
      if (start < earliest) continue;
      const clash = busy.some(
        (b) => start.getTime() < b.end.getTime() + buffer && b.start.getTime() < end.getTime() + buffer,
      );
      if (!clash) slots.push({ start, end, label: hhmm(m) });
    }
  }
  return slots.sort((a, b) => a.start.getTime() - b.start.getTime());
}
