import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Card, CardHeader, Eyebrow, Grid, Stack, Text } from "@/components/ui";
import { formatIsoDate, ljubljanaNow } from "@/lib/date";
import {
  CLOSURE_MAX_DAYS,
  CLOSURE_REASON_MAX,
  listClosures,
  listHolidays,
  type Closure,
  type HolidayRow,
} from "@/server/data/settings-hours";
import { AccessDenied, requireOwnerPage } from "../../owner-gate";
import { addClosureAction, deleteClosureAction, setHolidayOpenAnywayAction } from "./actions";
import { AddClosureForm, DeleteClosureButton, HolidaySwitch, type ClosureFormLabels } from "./ClosureForms";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("settings"))("sections.closures") };
}

export default async function SettingsClosuresPage() {
  const gate = await requireOwnerPage();
  if (!gate.ok) return <AccessDenied />;
  const [holidays, closures, t, holidayT] = await Promise.all([
    listHolidays(gate.ctx),
    listClosures(gate.ctx),
    getTranslations("settingsClosures"),
    getTranslations("holidays"),
  ]);
  const today = ljubljanaNow().dateISO;
  const currentYear = Number(today.slice(0, 4));
  const years = [currentYear, currentYear + 1];

  const actionErrors = { forbidden: t("errors.forbidden"), readOnly: t("errors.readOnly") };
  const dateErrors = {
    required: t("errors.required"),
    invalid_date: t("errors.invalid_date"),
    in_past: t("errors.in_past"),
    end_before_start: t("errors.end_before_start"),
    too_long: t("errors.too_long", { maxDays: CLOSURE_MAX_DAYS }),
  };
  const formLabels: ClosureFormLabels = {
    fields: {
      startDate: t("closures.fields.startDate"),
      endDate: t("closures.fields.endDate"),
      reason: t("closures.fields.reason"),
    },
    reasonPlaceholder: t("closures.reasonPlaceholder"),
    submit: t("closures.submit"),
    added: t("closures.added"),
    fieldErrors: {
      startDate: dateErrors,
      endDate: dateErrors,
      reason: { too_long: t("errors.reasonTooLong", { max: CLOSURE_REASON_MAX }) },
    },
    errors: actionErrors,
  };

  const holidayName = (h: HolidayRow) =>
    h.key && holidayT.has(h.key as Parameters<typeof holidayT.has>[0])
      ? holidayT(h.key as Parameters<typeof holidayT>[0])
      : t("holidays.unnamed");
  const closureDates = (c: Closure) =>
    c.startDate === c.endDate
      ? formatIsoDate(c.startDate)
      : t("closures.range", { start: formatIsoDate(c.startDate), end: formatIsoDate(c.endDate) });
  const upcoming = closures.filter((c) => c.endDate >= today);

  return (
    <Stack gap={8}>
      <Card data-testid="settings-closures">
        <CardHeader title={t("holidays.title")}>
          <Text size="small" tone="muted">
            {t("holidays.description")}
          </Text>
        </CardHeader>
        <Grid cols={2} gap="lg">
          {years.map((year) => {
            const rows = holidays.filter((h) => h.year === year);
            return (
              <section key={year} data-testid={`holidays-${year}`} className="flex flex-col gap-4">
                <Eyebrow as="h4">{t("holidays.year", { year })}</Eyebrow>
                {rows.length === 0 ? (
                  <Text size="small" tone="muted">
                    {t("holidays.empty")}
                  </Text>
                ) : (
                  <ul className="flex flex-col">
                    {rows.map((h) => (
                      <li
                        key={h.id}
                        data-testid={`holiday-${h.date}`}
                        className="flex flex-col gap-3 border-t border-dashed border-line py-4 first:border-t-0 first:pt-0"
                      >
                        <div className="flex items-baseline gap-4">
                          <span className="type-utility tabular text-ink">{formatIsoDate(h.date)}</span>
                          <span className="text-body font-[650] text-ink">{holidayName(h)}</span>
                        </div>
                        <HolidaySwitch
                          action={setHolidayOpenAnywayAction}
                          id={h.id}
                          openAnyway={h.openAnyway}
                          labels={{ label: t("holidays.openAnyway"), hint: t("holidays.openAnywayHint"), errors: actionErrors }}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </Grid>
      </Card>

      <Card data-testid="settings-custom-closures">
        <CardHeader title={t("closures.title")}>
          <Text size="small" tone="muted">
            {t("closures.description")}
          </Text>
        </CardHeader>
        <Stack gap={8}>
          <AddClosureForm action={addClosureAction} today={today} labels={formLabels} />
          <Stack gap={3}>
            <Eyebrow as="h4">{t("closures.upcoming")}</Eyebrow>
            {upcoming.length === 0 ? (
              <Text size="small" tone="muted" data-testid="closures-empty">
                {t("closures.empty")}
              </Text>
            ) : (
              <ul className="flex flex-col" data-testid="closures-list">
                {upcoming.map((c) => {
                  const dates = closureDates(c);
                  return (
                    <li
                      key={c.id}
                      data-testid={`closure-${c.id}`}
                      className="flex items-center justify-between gap-4 border-t border-dashed border-line py-3"
                    >
                      <div className="flex flex-col gap-1 md:flex-row md:items-baseline md:gap-4">
                        <span className="type-utility tabular text-ink">{dates}</span>
                        <span className={c.reason ? "text-body text-ink-2" : "text-body text-muted"}>
                          {c.reason ?? t("closures.noReason")}
                        </span>
                      </div>
                      <DeleteClosureButton
                        action={deleteClosureAction}
                        id={c.id}
                        labels={{ submit: t("closures.delete"), ariaLabel: t("closures.deleteLabel", { dates }), errors: actionErrors }}
                      />
                    </li>
                  );
                })}
              </ul>
            )}
          </Stack>
        </Stack>
      </Card>
    </Stack>
  );
}
