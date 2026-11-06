import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Badge, Button, Card, Container, Eyebrow, PageHeader, Select, Stack, Text } from "@/components/ui";
import { formatDateShort, formatTime, ljubljanaNow, toLjubljanaParts } from "@/lib/date";
import { requireDealerUser } from "@/server/auth/permissions";
import { listBookings, type BookingView } from "@/server/data/bookings";
import { listCarsForAdmin } from "@/server/data/cars";
import { cancelBookingAction } from "./actions";
import { CancelBookingButton } from "./CancelBookingButton";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("bookings"))("title") };
}

const RANGE_DAYS = 31;

type Props = { searchParams?: Promise<Record<string, string | string[] | undefined>> };

export default async function BookingsPage({ searchParams }: Props) {
  const { ctx } = await requireDealerUser();
  const query = (await searchParams) ?? {};
  const carParam = typeof query.car === "string" ? query.car : undefined;
  const today = ljubljanaNow().dateISO;
  const [t, cars] = await Promise.all([getTranslations("bookings"), listCarsForAdmin(ctx)]);
  const carId = carParam && cars.some((c) => c.id === carParam) ? carParam : undefined;
  const list = await listBookings(ctx, { fromDate: today, days: RANGE_DAYS, carId });

  const byDay = new Map<string, BookingView[]>();
  for (const b of list) {
    const day = toLjubljanaParts(b.startsAt).dateISO;
    byDay.set(day, [...(byDay.get(day) ?? []), b]);
  }
  const errors = { forbidden: t("errors.forbidden"), readOnly: t("errors.readOnly"), alreadyCancelled: t("errors.alreadyCancelled") };

  return (
    <Container className="py-10 md:py-16">
      <Stack gap={8}>
        <PageHeader eyebrow={t("range", { days: RANGE_DAYS })} title={t("title")} description={t("description")} />
        <form method="get" className="flex flex-wrap items-end gap-3" data-testid="bookings-filter">
          <div className="w-full sm:w-80">
            <Select label={t("filterLabel")} name="car" defaultValue={carId ?? ""}>
              <option value="">{t("allCars")}</option>
              {cars.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.make} {c.model}
                </option>
              ))}
            </Select>
          </div>
          <Button type="submit" variant="secondary">
            {t("filter")}
          </Button>
        </form>

        {list.length === 0 ? (
          <Card tone="sunken">
            <Text data-testid="bookings-empty">{t("empty")}</Text>
          </Card>
        ) : (
          <Stack gap={8}>
            {[...byDay.entries()].map(([day, items]) => (
              <section key={day} className="flex flex-col gap-3" data-testid={`bookings-day-${day}`}>
                <Eyebrow as="h2">{formatDateShort(items[0].startsAt)}</Eyebrow>
                <ul className="flex flex-col">
                  {items.map((b) => {
                    const cancelled = b.status === "cancelled";
                    return (
                      <li
                        key={b.id}
                        data-testid={`booking-${b.id}`}
                        className="grid gap-3 border-t border-line py-4 md:grid-cols-12 md:items-start"
                      >
                        <div className="flex flex-col gap-1 md:col-span-2">
                          <span className={`type-utility tabular text-ink ${cancelled ? "line-through" : ""}`}>
                            {formatTime(b.startsAt)}–{formatTime(b.endsAt)}
                          </span>
                          <span className="type-utility text-muted">{t(`kind.${b.kind}`)}</span>
                        </div>
                        <div className="flex flex-col gap-1 md:col-span-4">
                          <span className="font-[650] text-ink">
                            {b.car.make} {b.car.model}
                          </span>
                          <span className="type-utility text-muted">{t("code", { code: b.code })}</span>
                        </div>
                        <div className="flex flex-col gap-1 md:col-span-4">
                          <span className="text-body text-ink">{b.customerName}</span>
                          <a href={`tel:${b.customerPhone}`} className="text-small tabular text-ink-2 underline underline-offset-4">
                            {b.customerPhone}
                          </a>
                          {b.customerEmail ? (
                            <a href={`mailto:${b.customerEmail}`} className="text-small text-ink-2 underline underline-offset-4">
                              {b.customerEmail}
                            </a>
                          ) : (
                            <span className="text-small text-muted">{t("noEmail")}</span>
                          )}
                          {b.customerNote && (
                            <Text size="small" className="whitespace-pre-line">
                              {t("note", { note: b.customerNote })}
                            </Text>
                          )}
                        </div>
                        <div className="flex flex-col items-start gap-2 md:col-span-2 md:items-end">
                          <Badge tone={cancelled ? "neutral" : "ok"}>{t(`status.${b.status}`)}</Badge>
                          {!cancelled && (
                            <CancelBookingButton
                              action={cancelBookingAction}
                              id={b.id}
                              labels={{ submit: t("cancel"), ariaLabel: t("cancelLabel", { code: b.code }), hint: t("cancelHint"), errors }}
                            />
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </Stack>
        )}
      </Stack>
    </Container>
  );
}
