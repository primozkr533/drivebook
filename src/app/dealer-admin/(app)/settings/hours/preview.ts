import type { DayHours } from "@/components/signature";
import { parseTime, WEEKDAYS, type TimeRange, type WeekHoursInput } from "@/lib/opening-hours";
import { weekDays } from "@/app/site/[slug]/model";

// Incomplete or inverted rows are still being typed; they are flagged in the editor, not drawn.
const drawable = (r: TimeRange) => {
  const start = parseTime(r.opens);
  const end = parseTime(r.closes);
  return start !== null && end !== null && start < end;
};

export function previewDays(week: WeekHoursInput): DayHours[] {
  return weekDays(
    WEEKDAYS.flatMap((day) =>
      (week[day] ?? []).filter(drawable).map((r) => ({ isoWeekday: day, opensAt: r.opens, closesAt: r.closes })),
    ),
  );
}
