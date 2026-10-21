import { describe, expect, it, vi } from "vitest";
import {
  TIME_ZONE,
  addDays,
  daysBetween,
  isValidDateISO,
  isoWeekday,
  WEEKDAY_SHORT_SL,
  easterSunday,
  formatDate,
  formatDateShort,
  formatTime,
  ljubljanaNow,
  slovenianWorkFreeDays,
  ticketDateParts,
  timeOfDay,
  timeToMinutes,
  toLjubljanaParts,
  weekdayShortSl,
  zonedToUtc,
} from "@/lib/date";
import holidays from "../../messages/sl/holidays.json";

const thursday = new Date("2026-10-22T12:30:00Z");

describe("date", () => {
  it("uses the Ljubljana time zone", () => {
    expect(TIME_ZONE).toBe("Europe/Ljubljana");
  });

  it("ljubljanaNow crosses local midnight", () => {
    expect(ljubljanaNow(new Date("2026-10-20T22:30:00Z"))).toEqual({
      dateISO: "2026-10-21",
      isoWeekday: 3,
      minutes: 30,
    });
  });

  it("toLjubljanaParts handles winter time and Sunday", () => {
    expect(toLjubljanaParts(new Date("2026-12-27T23:15:00Z"))).toEqual({
      dateISO: "2026-12-28",
      isoWeekday: 1,
      minutes: 15,
    });
    expect(toLjubljanaParts(new Date("2026-12-27T10:00:00Z")).isoWeekday).toBe(7);
  });

  it("zonedToUtc converts summer and winter times", () => {
    expect(zonedToUtc("2026-07-01", "12:00").toISOString()).toBe("2026-07-01T10:00:00.000Z");
    expect(zonedToUtc("2026-01-15", "09:00").toISOString()).toBe("2026-01-15T08:00:00.000Z");
  });

  it("zonedToUtc handles DST start", () => {
    expect(zonedToUtc("2026-03-29", "03:30").toISOString()).toBe("2026-03-29T01:30:00.000Z");
    expect(zonedToUtc("2026-03-29", "01:30").toISOString()).toBe("2026-03-29T00:30:00.000Z");
    // 02:30 does not exist; moves forward to 03:00 CEST.
    expect(zonedToUtc("2026-03-29", "02:30").toISOString()).toBe("2026-03-29T01:00:00.000Z");
  });

  it("zonedToUtc handles DST end, picking the summer-time occurrence", () => {
    expect(zonedToUtc("2026-10-25", "02:30").toISOString()).toBe("2026-10-25T00:30:00.000Z");
    expect(zonedToUtc("2026-10-25", "03:30").toISOString()).toBe("2026-10-25T02:30:00.000Z");
    expect(zonedToUtc("2026-10-25", "01:30").toISOString()).toBe("2026-10-24T23:30:00.000Z");
  });

  it("formats in Slovenian", () => {
    expect(formatTime(thursday)).toBe("14:30");
    expect(formatDate(thursday)).toBe("22. 10. 2026");
    expect(formatDateShort(thursday)).toBe("čet 22. 10.");
    expect(ticketDateParts(thursday)).toEqual({ weekday: "čet", day: "22", month: "okt" });
  });

  it("formatTime pads morning hours", () => {
    expect(formatTime(new Date("2026-10-22T06:05:00Z"))).toBe("08:05");
  });

  it("parses Postgres times", () => {
    expect(timeOfDay("08:00:00")).toBe("08:00");
    expect(timeToMinutes("18:30")).toBe(1110);
    expect(timeToMinutes("00:00")).toBe(0);
    expect(() => timeToMinutes("25:00")).toThrow();
  });

  it("maps ISO weekdays to Slovenian short names", () => {
    expect(WEEKDAY_SHORT_SL).toEqual(["Pon", "Tor", "Sre", "Čet", "Pet", "Sob", "Ned"]);
    expect(weekdayShortSl(1)).toBe("Pon");
    expect(weekdayShortSl(7)).toBe("Ned");
  });
});

describe("Slovenian work-free days", () => {
  it("computes Gregorian Easter Sunday", () => {
    expect(easterSunday(2024)).toBe("2024-03-31");
    expect(easterSunday(2025)).toBe("2025-04-20");
    expect(easterSunday(2026)).toBe("2026-04-05");
    expect(easterSunday(2027)).toBe("2027-03-28");
    expect(easterSunday(2038)).toBe("2038-04-25");
    expect(easterSunday(2285)).toBe("2285-03-22");
  });

  it("lists all 15 days of 2026 in date order", () => {
    expect(slovenianWorkFreeDays(2026)).toEqual([
      { date: "2026-01-01", key: "newYear1" },
      { date: "2026-01-02", key: "newYear2" },
      { date: "2026-02-08", key: "preseren" },
      { date: "2026-04-05", key: "easterSunday" },
      { date: "2026-04-06", key: "easterMonday" },
      { date: "2026-04-27", key: "uprising" },
      { date: "2026-05-01", key: "labour1" },
      { date: "2026-05-02", key: "labour2" },
      { date: "2026-05-24", key: "whitSunday" },
      { date: "2026-06-25", key: "statehood" },
      { date: "2026-08-15", key: "assumption" },
      { date: "2026-10-31", key: "reformation" },
      { date: "2026-11-01", key: "remembrance" },
      { date: "2026-12-25", key: "christmas" },
      { date: "2026-12-26", key: "independence" },
    ]);
  });

  it("has a non-empty holidays.json translation for every key", () => {
    const names: Record<string, unknown> = holidays;
    for (let year = 2000; year <= 2100; year++) {
      for (const { key } of slovenianWorkFreeDays(year)) {
        expect(names[key], key).toBeTypeOf("string");
        expect((names[key] as string).trim(), key).not.toBe("");
      }
    }
    expect(names.christmas).toBe("božič");
  });

  it("places Whit Sunday 49 days after Easter, also across the DST change", () => {
    const days2025 = slovenianWorkFreeDays(2025);
    expect(days2025.find((d) => d.key === "whitSunday")?.date).toBe("2025-06-08");
    expect(days2025.find((d) => d.key === "easterMonday")?.date).toBe("2025-04-21");
    expect(slovenianWorkFreeDays(2024).find((d) => d.key === "easterMonday")?.date).toBe("2024-04-01");
  });

  it("omits 2 January only in 2013 to 2016", () => {
    const hasJan2 = (year: number) =>
      slovenianWorkFreeDays(year).some((d) => d.date === `${year}-01-02`);
    expect(hasJan2(2012)).toBe(true);
    for (const year of [2013, 2014, 2015, 2016]) expect(hasJan2(year)).toBe(false);
    expect(slovenianWorkFreeDays(2015)).toHaveLength(14);
    expect(hasJan2(2017)).toBe(true);
    expect(slovenianWorkFreeDays(2017)).toHaveLength(15);
  });

  it("returns sorted ISO dates for every year", () => {
    for (let year = 2000; year <= 2100; year++) {
      const dates = slovenianWorkFreeDays(year).map((d) => d.date);
      expect(dates.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && d.startsWith(`${year}-`))).toBe(true);
      expect([...dates].sort()).toEqual(dates);
    }
  });

  it("does not read the clock", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("1999-01-01T00:00:00Z"));
      const before = slovenianWorkFreeDays(2026);
      vi.setSystemTime(new Date("2031-07-01T00:00:00Z"));
      expect(slovenianWorkFreeDays(2026)).toEqual(before);
      expect(easterSunday(2026)).toBe("2026-04-05");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("plain date helpers", () => {
  it("addDays crosses month, year and leap-day boundaries", () => {
    expect(addDays("2026-10-21", 1)).toBe("2026-10-22");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2027-02-28", 1)).toBe("2027-03-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDays("2026-05-05", 0)).toBe("2026-05-05");
  });

  it("addDays keeps whole days across both DST changes", () => {
    expect(addDays("2026-03-28", 1)).toBe("2026-03-29");
    expect(addDays("2026-03-29", 1)).toBe("2026-03-30");
    expect(addDays("2026-10-24", 1)).toBe("2026-10-25");
    expect(addDays("2026-10-25", 1)).toBe("2026-10-26");
    expect(addDays("2026-03-22", 14)).toBe("2026-04-05");
  });

  it("daysBetween counts calendar days, also across DST", () => {
    expect(daysBetween("2026-03-28", "2026-03-30")).toBe(2);
    expect(daysBetween("2026-10-24", "2026-10-26")).toBe(2);
    expect(daysBetween("2026-01-01", "2026-12-31")).toBe(364);
    expect(daysBetween("2026-01-02", "2026-01-01")).toBe(-1);
  });

  it("isoWeekday maps Monday to 1 and Sunday to 7", () => {
    expect(isoWeekday("2026-10-19")).toBe(1);
    expect(isoWeekday("2026-10-22")).toBe(4);
    expect(isoWeekday("2026-10-25")).toBe(7);
    expect(isoWeekday("2026-03-29")).toBe(7);
  });

  it("rejects malformed and impossible dates", () => {
    expect(isValidDateISO("2026-02-28")).toBe(true);
    expect(isValidDateISO("2026-02-30")).toBe(false);
    expect(isValidDateISO("2026-13-01")).toBe(false);
    expect(isValidDateISO("26-1-1")).toBe(false);
    expect(() => addDays("2026-02-30", 1)).toThrow("Invalid date");
    expect(() => isoWeekday("nope")).toThrow("Invalid date");
  });
});
