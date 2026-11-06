import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { CarCard, HoursStrip } from "@/components/signature";
import { ButtonLink, Card, CardHeader, Container, Grid, Heading, Stack, Text } from "@/components/ui";
import { addDays, ljubljanaNow } from "@/lib/date";
import { getClosedDatesBetween, isDealerClosed } from "@/server/data/availability";
import { listActiveCars } from "@/server/data/cars";
import { resolveDealerSlug } from "@/server/data/dealers";
import { listOpeningHours } from "@/server/data/hours";
import { DealerSiteShell } from "./DealerSiteShell";
import { buildDealerPageModel } from "./model";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

async function loadDealer(slug: string) {
  const resolved = await resolveDealerSlug(slug);
  if (resolved.kind !== "current") notFound();
  return resolved;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { dealer } = await loadDealer((await params).slug);
  return { title: dealer.name };
}

export default async function DealerPage({ params, searchParams }: Props) {
  const [{ slug }, query, h, t, holidayT] = await Promise.all([
    params,
    searchParams,
    headers(),
    getTranslations("dealerPage"),
    getTranslations("holidays"),
  ]);
  const { ctx, dealer } = await loadDealer(slug);
  const suspended = dealer.status === "suspended";
  const now = ljubljanaNow();
  const [hours, cars, todayClosed, upcoming] = await Promise.all([
    listOpeningHours(ctx),
    suspended ? [] : listActiveCars(ctx),
    isDealerClosed(ctx, now.dateISO),
    getClosedDatesBetween(ctx, now.dateISO, addDays(now.dateISO, 14)),
  ]);

  const model = buildDealerPageModel({
    dealer,
    cars,
    hours,
    now,
    carParam: query.car,
    basePath: h.get("x-drivebook-base-path") ?? "",
    closures: { today: todayClosed, upcoming },
    holidayName: (key) => holidayT(key),
  });

  const carLabels = { selected: t("carSelected"), listing: t("carListing"), inactive: t("carInactive"), km: t("km") };

  const basePath = h.get("x-drivebook-base-path") ?? "";
  const bookHref = (carId: string) => `${basePath}/termin/${carId}`;

  return (
    <DealerSiteShell dealer={dealer} basePath={basePath}>
        <Container className="py-8">
          <Grid cols={12} from="lg" gap="lg">
            <section className="lg:col-span-8" aria-labelledby={model.suspended ? "suspended" : "cars"}>
              {model.suspended ? (
                <Card tone="sunken">
                  <Stack gap={3}>
                    <Heading size="h2" id="suspended">
                      {t("suspendedTitle")}
                    </Heading>
                    <Text>{t(model.phone ? "suspendedBody" : "suspendedBodyNoPhone")}</Text>
                  </Stack>
                </Card>
              ) : (
                <Stack gap={6}>
                  <Heading size="h2" id="cars">
                    {t("cars")}
                  </Heading>
                  {model.cars.length === 0 ? (
                    <Text tone="muted">{t("noCars")}</Text>
                  ) : (
                    <Grid cols={2} from="sm">
                      {model.cars.map(({ car, selected }) => (
                        <CarCard
                          key={car.id}
                          car={car}
                          selected={selected}
                          labels={carLabels}
                          action={
                            <ButtonLink href={bookHref(car.id)} variant={selected ? "brand" : "secondary"} data-testid={`book-${car.id}`}>
                              {t("bookCar")}
                            </ButtonLink>
                          }
                        />
                      ))}
                    </Grid>
                  )}
                </Stack>
              )}
            </section>

            <aside className="flex flex-col gap-6 lg:col-span-4">
              {!model.suspended && (
                <Card>
                  <CardHeader title={t("bookingTitle")} />
                  <Text size="small">{t("bookingHowTo")}</Text>
                </Card>
              )}
              <Card>
                <CardHeader title={t("openingHours")} />
                <HoursStrip days={model.days} today={model.today} nowMin={model.nowMin} closedLabel={t("closed")} compact />
              </Card>
              {model.closedDates.length > 0 && (
                <Card>
                  <CardHeader title={t("closedDatesTitle")} />
                  <ul className="flex flex-col" data-testid="closed-dates">
                    {model.closedDates.map((c) => (
                      <li key={c.date} className="flex justify-between gap-3 border-t border-line py-2">
                        <span className="font-mono text-code tabular text-ink">{c.date}</span>
                        <Text size="small" tone="muted" className="text-right">
                          {c.label ?? t("closed")}
                        </Text>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
            </aside>
          </Grid>
        </Container>
    </DealerSiteShell>
  );
}
