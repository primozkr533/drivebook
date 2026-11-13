import { describe, expect, it } from "vitest";
import { zonedToUtc } from "@/lib/date";
import { computeDaySlots } from "@/lib/slots";

const DATE = "2026-11-10"; // Tuesday, CET (UTC+1)
const rules = { durationMinutes: 45, stepMinutes: 15, bufferMinutes: 15 };
const at = (hhmm: string) => zonedToUtc(DATE, hhmm);

describe("computeDaySlots", () => {
  it("steps through each range and keeps the whole visit inside it", () => {
    const slots = computeDaySlots({ date: DATE, ranges: [{ opens: "08:00", closes: "09:30" }], rules, earliest: new Date(0), busy: [] });
    expect(slots.map((s) => s.label)).toEqual(["08:00", "08:15", "08:30", "08:45"]);
    expect(slots[0].start.toISOString()).toBe("2026-11-10T07:00:00.000Z");
    expect(slots[0].end.getTime() - slots[0].start.getTime()).toBe(45 * 60_000);
  });

  it("drops starts before the earliest allowed time (minimum notice)", () => {
    const slots = computeDaySlots({ date: DATE, ranges: [{ opens: "08:00", closes: "10:00" }], rules, earliest: at("08:20"), busy: [] });
    expect(slots[0].label).toBe("08:30");
  });

  it("keeps the buffer around the car's existing bookings", () => {
    const busy = [{ start: at("09:00"), end: at("09:45") }];
    const slots = computeDaySlots({ date: DATE, ranges: [{ opens: "08:00", closes: "11:30" }], rules, earliest: new Date(0), busy });
    const labels = slots.map((s) => s.label);
    // 08:00 ends 08:45 + 15 buffer = 09:00 → fine; 08:15 would end 09:00 with no buffer → blocked.
    expect(labels).toContain("08:00");
    expect(labels).not.toContain("08:15");
    expect(labels).not.toContain("09:45");
    expect(labels).toContain("10:00");
  });

  it("handles split ranges and returns nothing for a closed day", () => {
    const ranges = [
      { opens: "08:00", closes: "08:45" },
      { opens: "13:00", closes: "13:45" },
    ];
    expect(computeDaySlots({ date: DATE, ranges, rules, earliest: new Date(0), busy: [] }).map((s) => s.label)).toEqual(["08:00", "13:00"]);
    expect(computeDaySlots({ date: DATE, ranges: [], rules, earliest: new Date(0), busy: [] })).toEqual([]);
  });
});
