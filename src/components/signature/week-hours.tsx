import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/* ── WeekHours ─ the opening-hours timetable, set like a timetable column.
 * Today is marked with the brand rule. Multiple ranges per day supported. */

export type DayHours = { day: ReactNode; ranges: string[]; today?: boolean; note?: ReactNode };

export function WeekHours({
  days,
  closedLabel,
  todayLabel,
  className,
}: {
  days: DayHours[];
  /** "Zaprto" */
  closedLabel: ReactNode;
  /** "Danes" */
  todayLabel: ReactNode;
  className?: string;
}) {
  return (
    <dl className={cn("flex flex-col", className)}>
      {days.map((d, i) => (
        <div
          key={i}
          className={cn(
            "grid grid-cols-[5.5rem_minmax(0,1fr)] items-baseline gap-3 border-b border-line py-2.5 pl-3",
            d.today ? "border-l-(length:--rule-brand) border-l-brand bg-surface" : "border-l-(length:--rule-brand) border-l-transparent",
          )}
        >
          <dt className="flex flex-col font-utility text-caption font-medium uppercase tracking-utility text-ink">
            {d.day}
            {d.today && <span className="text-brand">{todayLabel}</span>}
          </dt>
          <dd className="flex flex-col text-sm tabular-nums">
            {d.ranges.length ? (
              <span className={cn("text-ink", d.today && "font-semibold")}>{d.ranges.join(" · ")}</span>
            ) : (
              <span className="font-display text-base italic text-muted">{closedLabel}</span>
            )}
            {d.note && <span className="text-xs text-muted">{d.note}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}
