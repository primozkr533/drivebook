import { cx } from "@/lib/cx";

export type DayHours = {
  short: string; // "Pon"
  ranges: Array<[string, string]>; // [["08:00","12:00"], …]
  note?: string; // e.g. holiday name
};

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

/**
 * HoursStrip — SIGNATURE. Opening hours as a road-map: each weekday is a lane on a
 * shared time axis; open ranges are solid blocks, closed days are hatched.
 * Same component on the public page (read) and as the preview beside the
 * opening-hours editor (admin). Pure: pass `today` / `nowMin` from the caller
 * (Europe/Ljubljana via the date utility) — never read the server clock here.
 * Responds to its container: ranges sit beside the lane when wide, below it when narrow.
 */
export function HoursStrip({
  days,
  from = "07:00",
  to = "20:00",
  today,
  nowMin,
  closedLabel = "Zaprto",
  compact = false,
}: {
  days: DayHours[];
  from?: string;
  to?: string;
  today?: number;
  nowMin?: number;
  closedLabel?: string;
  compact?: boolean;
}) {
  const start = toMin(from);
  const span = toMin(to) - start;
  const pct = (m: number) => `${(Math.min(Math.max(m - start, 0), span) / span) * 100}%`;
  const hours = span / 60;
  const ticks = Array.from({ length: hours + 1 }, (_, i) => start / 60 + i);

  return (
    <div className="@container flex flex-col">
      {/* axis */}
      <div className="grid grid-cols-[3rem_1fr] items-end gap-3 pb-2 @md:grid-cols-[3rem_1fr_10.5rem]">
        <span />
        <div className="relative h-4">
          {ticks.map((h, i) =>
            i % 2 === 0 ? (
              <span
                key={h}
                className="type-utility absolute -translate-x-1/2 text-[0.625rem] text-muted tabular"
                style={{ left: `${(i / hours) * 100}%` }}
              >
                {String(h).padStart(2, "0")}
              </span>
            ) : null,
          )}
        </div>
        <span className="hidden @md:block" />
      </div>

      <ul className="flex flex-col">
        {days.map((d, i) => {
          const closed = d.ranges.length === 0;
          const isToday = i === today;
          return (
            <li
              key={d.short}
              className={cx(
                "grid grid-cols-[3rem_1fr] items-center gap-x-3 gap-y-1.5 border-t border-line @md:grid-cols-[3rem_1fr_10.5rem]",
                compact ? "py-2" : "py-2.5",
              )}
            >
              <span className={cx("type-utility", isToday ? "text-signal-ink" : "text-ink")}>
                {isToday && <span aria-hidden className="mr-1 inline-block size-1.5 bg-signal align-middle" />}
                {d.short}
              </span>

              <div
                className={cx("relative h-5 bg-surface-2", closed && "opacity-80")}
                style={
                  closed
                    ? { backgroundImage: "repeating-linear-gradient(-45deg, var(--line) 0 2px, transparent 2px 7px)" }
                    : {
                        backgroundImage: `repeating-linear-gradient(90deg, var(--line) 0 1px, transparent 1px calc(100% / ${hours}))`,
                      }
                }
              >
                {d.ranges.map(([a, b]) => (
                  <span
                    key={a}
                    className={cx("absolute inset-y-0", isToday ? "bg-brand" : "bg-ink")}
                    style={{ left: pct(toMin(a)), width: `calc(${pct(toMin(b))} - ${pct(toMin(a))})` }}
                  />
                ))}
                {isToday && nowMin !== undefined && nowMin >= start && nowMin <= start + span && (
                  <span
                    aria-hidden
                    className="absolute -inset-y-1.5 w-0.5 bg-ink shadow-[0_0_0_2px_var(--ground)]"
                    style={{ left: pct(nowMin) }}
                  />
                )}
              </div>

              <span
                className={cx(
                  "col-start-2 font-mono text-code tabular @md:col-start-auto @md:text-right",
                  closed ? "text-muted" : "text-ink-2",
                )}
              >
                {closed ? (d.note ?? closedLabel) : d.ranges.map(([a, b]) => `${a}–${b}`).join(" · ")}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
