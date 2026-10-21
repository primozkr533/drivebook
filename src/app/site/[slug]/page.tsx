import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { cache } from "react";
import { CarCard } from "@/components/signature/CarCard";
import { HoursStrip } from "@/components/signature/HoursStrip";
import { ButtonLink, Card, CardHeader, Container, Grid, Heading, Shell, Stack, Text } from "@/components/ui";
import { brandStyle } from "@/lib/color";
import { addDays, ljubljanaNow } from "@/lib/date";
import { getClosedDatesBetween, isDealerClosed } from "@/server/data/availability";
import { listActiveCars } from "@/server/data/cars";
import { resolveDealerSlug } from "@/server/data/dealers";
import { listOpeningHours } from "@/server/data/hours";
import { buildDealerPageModel } from "./model";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// Shared by generateMetadata and the page so the slug resolves once per request.
const loadDealer = cache(async (slug: string) => {
  const resolved = await resolveDealerSlug(slug);
  if (resolved.kind !== "current") notFound();
  return resolved;
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { dealer } = await loadDealer((await params).slug);
  return { title: dealer.name };
}

export default async function DealerPage({ params, searchParams }: Props) {
  const [{ ctx, dealer }, query, h, t, holidayT] = await Promise.all([
    params.then(({ slug }) => loadDealer(slug)),
    searchParams,
    headers(),
    getTranslations("dealerPage"),
    getTranslations("holidays"),
  ]);
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

  const carLabels = { selected: t("carSelected"), listing: t("carListing"), inactive: t("carInactive") };

  const header = (
    <header className="relative border-b border-line-strong">
      <span aria-hidden className="absolute inset-x-0 top-0 h-1.5 bg-brand" />
      <Container className="flex flex-col gap-6 pb-6 pt-8 md:flex-row md:items-end md:justify-between">
        <div className="flex items-center gap-4">
          <div className="min-w-0">
            <Heading size="d1">
              {dealer.logoUrl ? (
                // The stored-file URL is app-relative and served on every host, so no base-path prefix.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={dealer.logoUrl}
                  alt={dealer.name}
                  width={256}
                  height={64}
                  decoding="async"
                  className="h-16 w-64 max-w-full object-contain object-left"
                />
              ) : (
                dealer.name
              )}
            </Heading>
            {model.address && (
              <address className="mt-1 not-italic">
                {model.address.line && <Text>{model.address.line}</Text>}
                {model.address.locality && <Text>{model.address.locality}</Text>}
              </address>
            )}
          </div>
        </div>
        {(model.telHref || model.emailHref || model.mapsHref) && (
          <div className="flex flex-wrap items-center gap-3">
            {model.telHref && (
              <ButtonLink href={model.telHref} variant="brand">
                {t("call")} <span className="tabular">{model.phone}</span>
              </ButtonLink>
            )}
            {model.emailHref && (
              <ButtonLink href={model.emailHref} variant="quiet">
                {model.email}
              </ButtonLink>
            )}
            {model.mapsHref && (
              <ButtonLink href={model.mapsHref} variant="quiet" target="_blank" rel="noopener noreferrer">
                {t("maps")}
              </ButtonLink>
            )}
          </div>
        )}
      </Container>
    </header>
  );

  const footer = (
    <footer className="border-t border-line">
      <Container className="flex flex-col gap-2 py-5 text-small text-muted md:flex-row md:justify-between">
        <span>{dealer.legalName}</span>
        <a
          href={model.privacy.href}
          className="text-ink-2 underline underline-offset-4"
          {...(model.privacy.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        >
          {t("privacy")}
        </a>
      </Container>
    </footer>
  );

  return (
    <div style={brandStyle(dealer.primaryColor)}>
      <Shell header={header} footer={footer}>
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
                      {model.cars.map(({ car, selected }, i) => (
                        <CarCard key={car.id} car={car} selected={selected} priority={i === 0} labels={carLabels} />
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
                  <Text size="small">{t("bookingSoon")}</Text>
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
      </Shell>
    </div>
  );
}
