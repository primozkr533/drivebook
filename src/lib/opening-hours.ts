export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type TimeRange = { opens: string; closes: string };
export type WeekHours = Record<Weekday, TimeRange[]>;
export type WeekHoursInput = Partial<Record<Weekday, readonly TimeRange[]>>;

export type HoursError = "invalid_time" | "end_before_start" | "overlap" | "too_many";
export type HoursErrorItem = { day: Weekday; index: number; error: HoursError };

export const WEEKDAYS: readonly Weekday[] = [1, 2, 3, 4, 5, 6, 7];
export const MAX_RANGES_PER_DAY = 4;
export const TIME_STEP_MINUTES = 15;

const TIME_RE = /^(\d{2}):(\d{2})$/;

export function emptyWeek(): WeekHours {
  return { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] };
}

export function parseTime(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const m = TIME_RE.exec(value);
  if (!m) return null;
  const minutes = Number(m[1]) * 60 + Number(m[2]);
  if (Number(m[2]) > 59 || minutes > 24 * 60 || minutes % TIME_STEP_MINUTES !== 0) return null;
  return minutes;
}

export function validateWeek(week: WeekHoursInput): { ok: true; week: WeekHours } | { ok: false; errors: HoursErrorItem[] } {
  const errors: HoursErrorItem[] = [];
  const result = emptyWeek();
  for (const day of WEEKDAYS) {
    const ranges = week[day] ?? [];
    if (ranges.length > MAX_RANGES_PER_DAY) {
      errors.push({ day, index: MAX_RANGES_PER_DAY, error: "too_many" });
      continue;
    }
    const valid: { index: number; start: number; end: number; range: TimeRange }[] = [];
    ranges.forEach((range, index) => {
      const start = parseTime(range?.opens);
      const end = parseTime(range?.closes);
      if (start === null || end === null) errors.push({ day, index, error: "invalid_time" });
      else if (start >= end) errors.push({ day, index, error: "end_before_start" });
      else valid.push({ index, start, end, range: { opens: range.opens, closes: range.closes } });
    });
    valid.sort((a, b) => a.start - b.start || a.end - b.end);
    let lastEnd = -1;
    for (const v of valid) {
      // Touching ranges (12:00–16:00 after 08:00–12:00) are allowed.
      if (v.start < lastEnd) errors.push({ day, index: v.index, error: "overlap" });
      lastEnd = Math.max(lastEnd, v.end);
    }
    result[day] = valid.map((v) => v.range);
  }
  if (errors.length > 0) {
    errors.sort((a, b) => a.day - b.day || a.index - b.index);
    return { ok: false, errors };
  }
  return { ok: true, week: result };
}
