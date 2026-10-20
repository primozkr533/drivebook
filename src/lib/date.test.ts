import { describe, expect, it } from "vitest";
import {
  TIME_ZONE,
  WEEKDAY_SHORT_SL,
  formatDate,
  formatDateShort,
  formatTime,
  ljubljanaNow,
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
