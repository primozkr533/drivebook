import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { CarCard, HoursStrip } from "@/components/signature";
import { ButtonLink, Card, CardHeader, Container, Grid, Heading, Shell, Stack, Text } from "@/components/ui";
import { brandStyle } from "@/lib/color";
import { ljubljanaNow } from "@/lib/date";
import { listActiveCars } from "@/server/data/cars";
import { resolveDealerSlug } from "@/server/data/dealers";
import { listOpeningHours } from "@/server/data/hours";
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
  const [{ slug }, query, h, t] = await Promise.all([params, searchParams, headers(), getTranslations("dealerPage")]);
  const { ctx, dealer } = await loadDealer(slug);
  const suspended = dealer.status === "suspended";
  const [hours, cars] = await Promise.all([listOpeningHours(ctx), suspended ? [] : listActiveCars(ctx)]);

  const model = buildDealerPageModel({
    dealer,
    cars,
    hours,
    now: ljubljanaNow(),
    carParam: query.car,
    basePath: h.get("x-drivebook-base-path") ?? "",
  });

  const carLabels = { selected: t("carSelected"), listing: t("carListing"), inactive: t("carInactive") };

  const header = (
    <header className="relative border-b border-line-strong">
      <span aria-hidden className="absolute inset-x-0 top-0 h-1.5 bg-brand" />
      <Container className="flex flex-col gap-6 pb-6 pt-8 md:flex-row md:items-end md:justify-between">
        <div className="flex items-center gap-4">
          {dealer.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={dealer.logoUrl} alt="" className="size-16 shrink-0 object-contain" />
          )}
          <div className="min-w-0">
            <Heading size="d1">{dealer.name}</Heading>
            {model.address && (
              <address className="mt-1 not-italic">
                {model.address.line && <Text>{model.address.line}</Text>}
                {model.address.locality && <Text>{model.address.locality}</Text>}
              </address>
            )}
          </div>
        </div>
        {(model.telHref || model.mapsHref) && (
          <div className="flex flex-wrap items-center gap-3">
            {model.telHref && (
              <ButtonLink href={model.telHref} variant="brand">
                {t("call")} <span className="tabular">{model.phone}</span>
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
                      {model.cars.map(({ car, selected }) => (
                        <CarCard key={car.id} car={car} selected={selected} labels={carLabels} />
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
            </aside>
          </Grid>
        </Container>
      </Shell>
    </div>
  );
}
