export const TIME_ZONE = "Europe/Ljubljana";

export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type LjubljanaParts = {
  dateISO: string;
  isoWeekday: IsoWeekday;
  minutes: number;
};

export const WEEKDAY_SHORT_SL = ["Pon", "Tor", "Sre", "Čet", "Pet", "Sob", "Ned"] as const;

const MONTH_SHORT_SL = [
  "jan", "feb", "mar", "apr", "maj", "jun", "jul", "avg", "sep", "okt", "nov", "dec",
] as const;

const EN_WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// en-US parts are stable to parse; Slovenian output is assembled from them.
const partsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  weekday: "short",
});

const timeFormatter = new Intl.DateTimeFormat("sl-SI", {
  timeZone: TIME_ZONE,
  hourCycle: "h23",
  hour: "2-digit",
  minute: "2-digit",
});

type WallClock = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  isoWeekday: IsoWeekday;
};

function wallClock(d: Date): WallClock {
  const parts = partsFormatter.formatToParts(d);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return {
    year: Number(value("year")),
    month: Number(value("month")),
    day: Number(value("day")),
    hour: Number(value("hour")),
    minute: Number(value("minute")),
    second: Number(value("second")),
    isoWeekday: (EN_WEEKDAYS.indexOf(value("weekday")) + 1) as IsoWeekday,
  };
}

const pad2 = (n: number) => String(n).padStart(2, "0");

export function toLjubljanaParts(d: Date): LjubljanaParts {
  const w = wallClock(d);
  return {
    dateISO: `${w.year}-${pad2(w.month)}-${pad2(w.day)}`,
    isoWeekday: w.isoWeekday,
    minutes: w.hour * 60 + w.minute,
  };
}

export function ljubljanaNow(now: Date = new Date()): LjubljanaParts {
  return toLjubljanaParts(now);
}

function offsetMs(t: number): number {
  const w = wallClock(new Date(t));
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return asUtc - Math.floor(t / 1000) * 1000;
}

/**
 * Converts a Ljubljana wall-clock time to the UTC instant.
 * - Non-existent times (spring-forward gap) move forward to the next valid instant,
 *   i.e. the transition itself (2026-03-29 02:30 → 03:00 CEST).
 * - Ambiguous times (fall-back) resolve to the first, summer-time occurrence
 *   (2026-10-25 02:30 → 02:30 CEST = 00:30Z).
 */
export function zonedToUtc(dateISO: string, hhmm: string): Date {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateISO);
  if (!dm) throw new Error(`Invalid date: ${dateISO}`);
  const minutes = timeToMinutes(hhmm);
  const wall = Date.UTC(Number(dm[1]), Number(dm[2]) - 1, Number(dm[3])) + minutes * 60_000;

  const DAY = 86_400_000;
  // Larger offset first: it yields the earlier instant, i.e. summer time when ambiguous.
  const offsets = [...new Set([offsetMs(wall - DAY), offsetMs(wall + DAY)])].sort((a, b) => b - a);
  for (const o of offsets) {
    const t = wall - o;
    if (offsetMs(t) === o) return new Date(t);
  }

  // Gap: find the first instant carrying the post-transition offset.
  const after = offsetMs(wall + DAY);
  let lo = wall - Math.max(...offsets);
  let hi = wall - Math.min(...offsets);
  while (hi - lo > 60_000) {
    const mid = lo + Math.floor((hi - lo) / 120_000) * 60_000;
    if (offsetMs(mid) === after) hi = mid;
    else lo = mid;
  }
  return new Date(hi);
}

export function formatTime(d: Date): string {
  return timeFormatter.format(d);
}

export function formatDate(d: Date): string {
  const w = wallClock(d);
  return `${w.day}. ${w.month}. ${w.year}`;
}

// For Postgres `date` columns (YYYY-MM-DD): a calendar day, so no time-zone shift applies.
export function formatIsoDate(dateISO: string): string {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateISO);
  if (!dm) throw new Error(`Invalid date: ${dateISO}`);
  return `${Number(dm[3])}. ${Number(dm[2])}. ${dm[1]}`;
}

export function formatDateShort(d: Date): string {
  const w = wallClock(d);
  return `${weekdayShortSl(w.isoWeekday).toLowerCase()} ${w.day}. ${w.month}.`;
}

export function timeOfDay(pgTime: string): string {
  if (!/^\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(pgTime)) throw new Error(`Invalid time: ${pgTime}`);
  return pgTime.slice(0, 5);
}

export function timeToMinutes(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(hhmm);
  if (!m) throw new Error(`Invalid time: ${hhmm}`);
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59 || (h === 24 && min > 0)) throw new Error(`Invalid time: ${hhmm}`);
  return h * 60 + min;
}

export function weekdayShortSl(isoWeekday: IsoWeekday): string {
  return WEEKDAY_SHORT_SL[isoWeekday - 1];
}

export function ticketDateParts(d: Date): { weekday: string; day: string; month: string } {
  const w = wallClock(d);
  return {
    weekday: weekdayShortSl(w.isoWeekday).toLowerCase(),
    day: String(w.day),
    month: MONTH_SHORT_SL[w.month - 1],
  };
}

const DAY_MS = 86_400_000;

function utcDateISO(t: number): string {
  const d = new Date(t);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

function easterSundayUtc(year: number): number {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return Date.UTC(year, month - 1, day);
}

export function easterSunday(year: number): string {
  return utcDateISO(easterSundayUtc(year));
}

export type WorkFreeDay = { date: string; key: string };

export function slovenianWorkFreeDays(year: number): WorkFreeDay[] {
  const easter = easterSundayUtc(year);
  const fixed = (month: number, day: number) => utcDateISO(Date.UTC(year, month - 1, day));
  const days: WorkFreeDay[] = [
    { date: fixed(1, 1), key: "newYear1" },
    { date: fixed(2, 8), key: "preseren" },
    { date: utcDateISO(easter), key: "easterSunday" },
    { date: utcDateISO(easter + DAY_MS), key: "easterMonday" },
    { date: fixed(4, 27), key: "uprising" },
    { date: fixed(5, 1), key: "labour1" },
    { date: fixed(5, 2), key: "labour2" },
    { date: utcDateISO(easter + 49 * DAY_MS), key: "whitSunday" },
    { date: fixed(6, 25), key: "statehood" },
    { date: fixed(8, 15), key: "assumption" },
    { date: fixed(10, 31), key: "reformation" },
    { date: fixed(11, 1), key: "remembrance" },
    { date: fixed(12, 25), key: "christmas" },
    { date: fixed(12, 26), key: "independence" },
  ];
  // 2 January was not a work-free day from 2013 to 2016 (restored by law in 2017).
  if (year < 2013 || year > 2016) {
    days.push({ date: fixed(1, 2), key: "newYear2" });
  }
  return days.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0));
}

// Plain calendar-day arithmetic on YYYY-MM-DD: UTC has no DST, so a day is always 24 h here.
function parseDateISO(dateISO: string): number {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateISO);
  if (!dm) throw new Error(`Invalid date: ${dateISO}`);
  const t = Date.UTC(Number(dm[1]), Number(dm[2]) - 1, Number(dm[3]));
  if (utcDateISO(t) !== dateISO) throw new Error(`Invalid date: ${dateISO}`);
  return t;
}

export function isValidDateISO(dateISO: string): boolean {
  try {
    parseDateISO(dateISO);
    return true;
  } catch {
    return false;
  }
}

export function addDays(dateISO: string, n: number): string {
  return utcDateISO(parseDateISO(dateISO) + n * DAY_MS);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((parseDateISO(to) - parseDateISO(from)) / DAY_MS);
}

export function isoWeekday(dateISO: string): IsoWeekday {
  return (((new Date(parseDateISO(dateISO)).getUTCDay() + 6) % 7) + 1) as IsoWeekday;
}
