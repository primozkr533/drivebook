import { describe, expect, it, vi } from "vitest";
import {
  TIME_ZONE,
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
      { date: "2026-01-01", key: "newYear1", name: "novo leto" },
      { date: "2026-01-02", key: "newYear2", name: "novo leto" },
      { date: "2026-02-08", key: "preseren", name: "Prešernov dan, slovenski kulturni praznik" },
      { date: "2026-04-05", key: "easterSunday", name: "velikonočna nedelja" },
      { date: "2026-04-06", key: "easterMonday", name: "velikonočni ponedeljek" },
      { date: "2026-04-27", key: "uprising", name: "dan upora proti okupatorju" },
      { date: "2026-05-01", key: "labour1", name: "praznik dela" },
      { date: "2026-05-02", key: "labour2", name: "praznik dela" },
      { date: "2026-05-24", key: "whitSunday", name: "binkoštna nedelja" },
      { date: "2026-06-25", key: "statehood", name: "dan državnosti" },
      { date: "2026-08-15", key: "assumption", name: "Marijino vnebovzetje" },
      { date: "2026-10-31", key: "reformation", name: "dan reformacije" },
      { date: "2026-11-01", key: "remembrance", name: "dan spomina na mrtve" },
      { date: "2026-12-25", key: "christmas", name: "božič" },
      { date: "2026-12-26", key: "independence", name: "dan samostojnosti in enotnosti" },
    ]);
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
