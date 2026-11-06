import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { CarCard } from "@/components/signature";
import { Card, CardHeader, Container, Eyebrow, Grid, Heading, Stack, Text } from "@/components/ui";
import { cx } from "@/lib/cx";
import { formatDateShort, ticketDateParts, zonedToUtc } from "@/lib/date";
import { BOOKING_KINDS, getCarAvailability, isBookingKind, type BookingKind } from "@/server/data/bookings";
import { getCar } from "@/server/data/cars";
import { resolveDealerSlug } from "@/server/data/dealers";
import { BASE_PATH_HEADER } from "@/server/routing";
import { DealerSiteShell } from "../../DealerSiteShell";
import { privacyLink } from "../../model";
import { createBookingAction } from "./actions";
import { BookingForm, type BookingFormLabels } from "./BookingForm";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ slug: string; carId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const t = await getTranslations("booking");
  const { slug } = await params;
  const resolved = await resolveDealerSlug(slug);
  return { title: resolved.kind === "current" ? `${t("title")} · ${resolved.dealer.name}` : t("title") };
}

const chip =
  "inline-flex min-h-11 items-center justify-center rounded-soft px-3 text-body font-[650] transition-colors duration-[var(--dur-fast)]";
const chipIdle = "bg-surface text-ink shadow-[inset_0_0_0_1px_var(--line)] hover:shadow-[inset_0_0_0_1.5px_var(--ink)]";
const chipOn = "bg-ink text-ground";

export default async function BookingPage({ params, searchParams }: Props) {
  const [{ slug, carId }, query, h, t, tPage] = await Promise.all([
    params,
    searchParams,
    headers(),
    getTranslations("booking"),
    getTranslations("dealerPage"),
  ]);
  const resolved = await resolveDealerSlug(slug);
  if (resolved.kind !== "current") notFound();
  const { ctx, dealer } = resolved;
  const basePath = h.get(BASE_PATH_HEADER) ?? "";
  const car = await getCar(ctx, carId);
  if (!car || !car.active) notFound();

  const homeHref = `${basePath}/`;
  const bookable = dealer.status === "active";
  const kindParam = one(query.kind);
  const kind: BookingKind = isBookingKind(kindParam) ? kindParam : "test_drive";
  const availability = bookable ? await getCarAvailability(ctx, car.id, kind) : null;
  const days = availability?.days ?? [];
  const dateParam = one(query.date);
  const firstOpen = days.find((d) => d.slots.length > 0)?.date;
  const date = days.some((d) => d.date === dateParam) ? dateParam! : firstOpen;
  const slots = days.find((d) => d.date === date)?.slots ?? [];
  const startParam = one(query.start);
  const selected = slots.find((s) => s.start.toISOString() === startParam);

  const href = (p: { kind?: BookingKind; date?: string; start?: string }, anchor?: string) => {
    const sp = new URLSearchParams();
    sp.set("kind", p.kind ?? kind);
    if (p.date) sp.set("date", p.date);
    if (p.start) sp.set("start", p.start);
    return `${basePath}/termin/${car.id}?${sp.toString()}${anchor ? `#${anchor}` : ""}`;
  };

  const common = { required: t("errors.required"), invalid: t("errors.invalid"), too_long: t("errors.too_long") };
  const formLabels: BookingFormLabels = {
    fields: { name: t("fields.name"), phone: t("fields.phone"), email: t("fields.email"), note: t("fields.note") },
    optional: t("optional"),
    phoneHint: t("phoneHint"),
    consent: t("consent"),
    privacy: t("privacy"),
    submit: t("submit"),
    fieldErrors: {
      name: common,
      phone: { ...common, invalid: t("errors.invalidPhone") },
      email: { ...common, invalid: t("errors.invalidEmail") },
      note: common,
      kind: common,
      start: { ...common, slot_taken: t("errors.slot_taken") },
    },
    errors: { readOnly: t("errors.readOnly"), carGone: t("errors.carGone") },
  };
  const carLabels = { selected: tPage("carSelected"), listing: tPage("carListing"), inactive: tPage("carInactive"), km: tPage("km") };

  return (
    <DealerSiteShell dealer={dealer} basePath={basePath} homeHref={homeHref} compact>
      <Container className="py-8 md:py-10">
        <Grid cols={12} from="lg" gap="lg">
          <section className="flex flex-col gap-8 lg:col-span-8" aria-labelledby="booking-title">
            <div className="flex flex-col gap-3">
              <a href={homeHref} className="type-utility text-ink-2 hover:text-ink">
                ← {t("back")}
              </a>
              <Heading size="h1" id="booking-title">
                {t("title")}
              </Heading>
              <Text size="lead" tone="ink">
                {car.make} {car.model}
              </Text>
            </div>

            {!bookable ? (
              <Card tone="sunken">
                <Text data-testid="booking-unavailable">{t("unavailable")}</Text>
              </Card>
            ) : (
              <>
                <Stack gap={3}>
                  <Eyebrow as="h2">{t("kindLabel")}</Eyebrow>
                  <div className="flex flex-wrap gap-2" data-testid="booking-kinds">
                    {BOOKING_KINDS.map((k) => (
                      <a key={k} href={href({ kind: k })} aria-current={k === kind ? "true" : undefined} className={cx(chip, "px-4", k === kind ? chipOn : chipIdle)}>
                        {t(`kind.${k}`)}
                      </a>
                    ))}
                  </div>
                  {availability && <Text size="small" tone="muted">{t("duration", { minutes: availability.durationMinutes })}</Text>}
                </Stack>

                {!firstOpen ? (
                  <Card tone="sunken">
                    <Text data-testid="booking-no-slots">{t("noSlots")}</Text>
                  </Card>
                ) : (
                  <>
                    <Stack gap={3}>
                      <Eyebrow as="h2">{t("dayLabel")}</Eyebrow>
                      <ul className="-mx-[var(--gutter)] flex gap-2 overflow-x-auto px-[var(--gutter)] pb-2 md:mx-0 md:flex-wrap md:px-0" data-testid="booking-days">
                        {days.map((d) => {
                          const parts = ticketDateParts(zonedToUtc(d.date, "12:00"));
                          const open = d.slots.length > 0;
                          const on = d.date === date;
                          const content = (
                            <>
                              <span className="type-utility">{parts.weekday}</span>
                              <span className="text-h3 font-[800] tabular">{parts.day}</span>
                              <span className="type-utility">{open ? parts.month : t("closedDay")}</span>
                            </>
                          );
                          const cls = cx("flex w-16 shrink-0 flex-col items-center gap-0.5 rounded-soft py-2", on ? chipOn : open ? chipIdle : "bg-surface-2 text-muted");
                          return (
                            <li key={d.date}>
                              {open ? (
                                <a href={href({ date: d.date }, "ure")} aria-current={on ? "date" : undefined} className={cls} data-testid={`day-${d.date}`}>
                                  {content}
                                </a>
                              ) : (
                                <span className={cls} aria-disabled="true">
                                  {content}
                                </span>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </Stack>

                    <div id="ure" className="flex scroll-mt-6 flex-col gap-3">
                      <Eyebrow as="h2">
                        {t("timeLabel")} {date && `· ${formatDateShort(zonedToUtc(date, "12:00"))}`}
                      </Eyebrow>
                      {slots.length === 0 ? (
                        <Text tone="muted">{t("noSlotsDay")}</Text>
                      ) : (
                        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-6" data-testid="booking-times">
                          {slots.map((s) => {
                            const iso = s.start.toISOString();
                            const on = selected?.start.getTime() === s.start.getTime();
                            return (
                              <li key={iso}>
                                <a
                                  href={href({ date, start: iso }, "podatki")}
                                  aria-current={on ? "true" : undefined}
                                  className={cx(chip, "w-full font-mono tabular", on ? chipOn : chipIdle)}
                                  data-testid={`slot-${s.label}`}
                                >
                                  {s.label}
                                </a>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>

                    {selected && date && (
                      <Card id="podatki" className="scroll-mt-6" data-testid="booking-details">
                        <CardHeader
                          title={t("formTitle")}
                          meta={
                            <span className="type-utility text-ink" data-testid="booking-selected">
                              {t("selected", { kind: t(`kind.${kind}`), date: formatDateShort(selected.start), time: selected.label })}
                            </span>
                          }
                        />
                        <BookingForm
                          action={createBookingAction.bind(null, slug)}
                          carId={car.id}
                          kind={kind}
                          start={selected.start.toISOString()}
                          privacyHref={privacyLink(dealer.privacyPolicyUrl, basePath).href}
                          labels={formLabels}
                        />
                      </Card>
                    )}
                  </>
                )}
              </>
            )}
          </section>

          <aside className="flex flex-col gap-6 lg:col-span-4">
            <CarCard car={car} labels={carLabels} />
          </aside>
        </Grid>
      </Container>
    </DealerSiteShell>
  );
}
