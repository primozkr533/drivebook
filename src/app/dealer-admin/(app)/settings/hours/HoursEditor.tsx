"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { HoursStrip } from "@/components/signature";
import { Badge, Button, Card, CardHeader, Grid, Input, Stack, Text } from "@/components/ui";
import {
  MAX_RANGES_PER_DAY,
  parseTime,
  TIME_STEP_MINUTES,
  validateWeek,
  WEEKDAYS,
  type HoursErrorItem,
  type TimeRange,
  type Weekday,
  type WeekHours,
} from "@/lib/opening-hours";
import { saveOpeningHoursAction, type SaveHoursState } from "./actions";
import { previewDays } from "./preview";

type Row = TimeRange & { key: number };
type FormWeek = Record<Weekday, Row[]>;
type Status = { kind: "idle" } | { kind: "saved" } | { kind: "error"; error: "forbidden" | "readOnly" | "hasErrors" };

const WORKDAYS: readonly Weekday[] = [2, 3, 4, 5];

const hhmm = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

function nextRange(rows: Row[]): TimeRange {
  const last = rows.at(-1);
  if (!last) return { opens: "08:00", closes: "16:00" };
  const start = parseTime(last.closes) ?? 12 * 60;
  return { opens: hhmm(start), closes: hhmm(Math.min(start + 2 * 60, 24 * 60)) };
}

const plain = (week: FormWeek): WeekHours =>
  Object.fromEntries(WEEKDAYS.map((d) => [d, week[d].map(({ opens, closes }) => ({ opens, closes }))])) as WeekHours;

export function HoursEditor({ initial }: { initial: WeekHours }) {
  const t = useTranslations("settingsHours");
  const nextKey = useRef(0);
  const withKeys = (week: WeekHours): FormWeek =>
    Object.fromEntries(WEEKDAYS.map((d) => [d, week[d].map((r) => ({ ...r, key: nextKey.current++ }))])) as FormWeek;

  const [week, setWeek] = useState<FormWeek>(() => withKeys(initial));
  const [serverErrors, setServerErrors] = useState<HoursErrorItem[]>([]);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [pending, startTransition] = useTransition();

  const current = useMemo(() => plain(week), [week]);
  const checked = useMemo(() => validateWeek(current), [current]);
  const clientErrors = checked.ok ? [] : checked.errors;
  const days = useMemo(() => previewDays(current), [current]);

  const errorFor = (day: Weekday, index: number) =>
    (serverErrors.find((e) => e.day === day && e.index === index) ?? clientErrors.find((e) => e.day === day && e.index === index))
      ?.error;

  const update = (fn: (w: FormWeek) => FormWeek) => {
    setWeek(fn);
    setServerErrors([]);
    setStatus({ kind: "idle" });
  };
  const setDay = (day: Weekday, rows: Row[]) => update((w) => ({ ...w, [day]: rows }));

  const copyMonday = () =>
    update((w) => {
      const next = { ...w };
      for (const d of WORKDAYS) next[d] = w[1].map(({ opens, closes }) => ({ opens, closes, key: nextKey.current++ }));
      return next;
    });

  const save = () =>
    startTransition(async () => {
      const result: SaveHoursState = await saveOpeningHoursAction(current);
      if (result.ok) {
        setWeek(withKeys(result.week));
        setServerErrors([]);
        setStatus({ kind: "saved" });
      } else if ("errors" in result) {
        setServerErrors(result.errors);
        setStatus({ kind: "error", error: "hasErrors" });
      } else {
        setStatus({ kind: "error", error: result.error });
      }
    });

  return (
    <Grid cols={12} from="lg">
      <Card className="lg:col-span-8" data-testid="hours-editor">
        <Stack gap={6}>
          <CardHeader
            title={t("title")}
            meta={
              <Button variant="secondary" size="sm" onClick={copyMonday} data-testid="hours-copy-monday">
                {t("copyMonday")}
              </Button>
            }
          >
            <Text size="small" tone="muted">
              {t("description")}
            </Text>
          </CardHeader>

          <ul className="flex flex-col">
            {WEEKDAYS.map((day) => {
              const rows = week[day];
              const name = t(`weekdays.${day}`);
              const tooMany = serverErrors.some((e) => e.day === day && e.error === "too_many");
              return (
                <li
                  key={day}
                  className="flex flex-col gap-3 border-t border-dashed border-line py-4"
                  data-testid={`hours-day-${day}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="type-utility text-ink">{name}</span>
                    {rows.length === 0 ? (
                      <span data-testid={`hours-closed-${day}`}>
                        <Badge>{t("closed")}</Badge>
                      </span>
                    ) : null}
                  </div>

                  {rows.map((row, index) => {
                    const error = errorFor(day, index);
                    return (
                      <div key={row.key} className="flex flex-col gap-1.5" data-testid={`hours-range-${day}-${index}`} data-error={error}>
                        <div className="flex flex-wrap items-end gap-3">
                          <div className="w-36">
                            <Input
                              label={t("opens")}
                              type="time"
                              step={TIME_STEP_MINUTES * 60}
                              value={row.opens}
                              aria-invalid={error ? true : undefined}
                              onChange={(e) => setDay(day, rows.map((r) => (r.key === row.key ? { ...r, opens: e.target.value } : r)))}
                              data-testid={`hours-opens-${day}-${index}`}
                            />
                          </div>
                          <div className="w-36">
                            <Input
                              label={t("closes")}
                              type="time"
                              step={TIME_STEP_MINUTES * 60}
                              value={row.closes}
                              aria-invalid={error ? true : undefined}
                              onChange={(e) => setDay(day, rows.map((r) => (r.key === row.key ? { ...r, closes: e.target.value } : r)))}
                              data-testid={`hours-closes-${day}-${index}`}
                            />
                          </div>
                          <Button
                            variant="quiet"
                            size="md"
                            aria-label={t("removeRangeLabel", { day: name, opens: row.opens, closes: row.closes })}
                            onClick={() => setDay(day, rows.filter((r) => r.key !== row.key))}
                            data-testid={`hours-remove-${day}-${index}`}
                          >
                            {t("removeRange")}
                          </Button>
                        </div>
                        {error ? (
                          <Text size="small" tone="danger" role="alert" data-testid={`hours-error-${day}-${index}`}>
                            {t(`errors.${error}`, { max: MAX_RANGES_PER_DAY })}
                          </Text>
                        ) : null}
                      </div>
                    );
                  })}

                  {tooMany ? (
                    <Text size="small" tone="danger" role="alert" data-testid={`hours-error-${day}`}>
                      {t("errors.too_many", { max: MAX_RANGES_PER_DAY })}
                    </Text>
                  ) : null}

                  <div>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={rows.length >= MAX_RANGES_PER_DAY}
                      onClick={() => setDay(day, [...rows, { ...nextRange(rows), key: nextKey.current++ }])}
                      data-testid={`hours-add-${day}`}
                    >
                      {t("addRange")}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="flex flex-wrap items-center gap-4 border-t border-line pt-5">
            <Button onClick={save} disabled={pending} data-testid="hours-save">
              {pending ? t("saving") : t("save")}
            </Button>
            {status.kind === "saved" ? (
              <Text size="small" tone="ok" role="status" data-testid="hours-saved">
                {t("saved")}
              </Text>
            ) : null}
            {status.kind === "error" ? (
              <Text size="small" tone="danger" role="alert" data-testid="hours-form-error" data-state={status.error}>
                {status.error === "hasErrors" ? t("hasErrors") : t(`errors.${status.error}`)}
              </Text>
            ) : null}
          </div>
        </Stack>
      </Card>

      <aside className="lg:col-span-4">
        <Card data-testid="hours-preview">
          <Stack gap={4}>
            <CardHeader title={t("preview.title")}>
              <Text size="small" tone="muted">
                {t("preview.hint")}
              </Text>
            </CardHeader>
            <HoursStrip days={days} closedLabel={t("closed")} compact />
          </Stack>
        </Card>
      </aside>
    </Grid>
  );
}
