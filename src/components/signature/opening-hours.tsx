import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";

export const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type Weekday = (typeof WEEKDAYS)[number];
export type TimeRange = readonly [start: string, end: string];
export type WeeklyHours = Record<Weekday, readonly TimeRange[]>;

/** Weekly opening hours: weekday rows, zero or more ranges each, today marked in the brand colour. */
export function OpeningHours({
  hours,
  today,
  className,
}: {
  hours: WeeklyHours;
  today?: Weekday;
  className?: string;
}) {
  const t = useTranslations();
  return (
    <dl className={cn("divide-y divide-line", className)}>
      {WEEKDAYS.map((day) => {
        const ranges = hours[day];
        const isToday = day === today;
        return (
          <div
            key={day}
            className={cn(
              "grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 py-2",
              isToday && "relative before:absolute before:-left-3 before:inset-y-1.5 before:w-[3px] before:bg-brand",
            )}
          >
            <dt className={cn("text-small", isToday ? "font-semibold text-ink" : "text-ink-soft")}>
              {t(`weekday.${day}`)}
              {isToday ? (
                <span className="ml-2 font-mono text-micro uppercase tracking-utility text-muted">
                  {t("publicPage.today")}
                </span>
              ) : null}
            </dt>
            <dd className="text-right font-mono text-small tabular">
              {ranges.length === 0 ? (
                <span className="text-faint">{t("publicPage.closed")}</span>
              ) : (
                ranges.map(([s, e]) => (
                  <span key={s} className="block text-ink">
                    {s}–{e}
                  </span>
                ))
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
