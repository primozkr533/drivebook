import { useTranslations } from "next-intl";
import { brandScope } from "@/lib/brand";
import { AppShell } from "@/components/ui/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Container, Grid, PageHeader, Split, Stack } from "@/components/ui/layout";
import { Eyebrow, Heading, Text } from "@/components/ui/text";
import { CarCard } from "@/components/signature/car-card";
import { OpeningHours } from "@/components/signature/opening-hours";
import { cars, dealer, deepLink, hours } from "./sample-data";

/* Representative screens composed ONLY from primitives + signatures. */

function DealerMonogram({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2);
  return (
    <span className="grid size-14 shrink-0 place-items-center rounded-md bg-brand font-display text-h3 font-bold text-brand-ink md:size-16">
      {initials}
    </span>
  );
}

function PublicHeader() {
  const t = useTranslations("publicPage");
  return (
    <header className="border-b border-line bg-surface">
      <div className="h-1 bg-brand" />
      <Container className="flex flex-col gap-5 py-6 md:flex-row md:items-center md:justify-between md:py-8">
        <div className="flex items-center gap-4">
          <DealerMonogram name={dealer.name} />
          <div className="min-w-0">
            <Heading as="h1" size="h1">
              {dealer.name}
            </Heading>
            <Text size="small" tone="muted">
              {dealer.address}
            </Text>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={dealer.phoneHref} className={buttonVariants({ variant: "brand" })}>
            {t("call")} <span className="font-mono tabular">{dealer.phone}</span>
          </a>
          <a href={dealer.mapsUrl} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "secondary" })}>
            {t("directions")} <span aria-hidden>↗</span>
          </a>
        </div>
      </Container>
    </header>
  );
}

function PublicFooter() {
  const t = useTranslations("publicPage");
  return (
    <footer className="border-t border-line">
      <Container className="flex flex-col gap-2 py-6 text-caption text-muted sm:flex-row sm:justify-between">
        <a href={dealer.privacyUrl} className="underline underline-offset-4 hover:text-ink">
          {t("privacy")}
        </a>
        <span className="font-mono text-micro uppercase tracking-utility">{t("poweredBy")}</span>
      </Container>
    </footer>
  );
}

/** {slug}.drivebook.si — public dealer page, with ?car= highlighting. Brand = dealer's own colour. */
export function PublicDealerScreen({ brand, selectedId }: { brand: string; selectedId?: string }) {
  const t = useTranslations("publicPage");
  const active = cars.filter((c) => c.active !== false);
  const ordered = selectedId
    ? [...active.filter((c) => c.id === selectedId), ...active.filter((c) => c.id !== selectedId)]
    : active;

  return (
    <div {...brandScope(brand)} className="bg-ground">
      <PublicHeader />
      <Container className="py-8 md:py-10">
        <Split
          asideWidth="21rem"
          aside={
            <Stack gap={4} className="lg:sticky lg:top-6">
              <Card variant="outline" pad="md" className="border-brand-line bg-brand-soft">
                <Stack gap={2}>
                  <Eyebrow className="text-ink">{t("bookingHeading")}</Eyebrow>
                  <Text size="small">{t("bookingSoon")}</Text>
                </Stack>
              </Card>
              <Card pad="md">
                <div className="mb-2 flex items-center justify-between">
                  <Eyebrow>{t("openingHours")}</Eyebrow>
                  <Badge tone="primary" dot>
                    {t("openNow")}
                  </Badge>
                </div>
                <OpeningHours hours={hours} today="thu" />
              </Card>
            </Stack>
          }
        >
          <Stack gap={4}>
            <div className="flex items-baseline justify-between gap-4">
              <Heading size="h3">{t("carsHeading")}</Heading>
              <span className="font-mono text-micro uppercase tracking-utility text-muted">
                {t("carsCount", { count: active.length })}
              </span>
            </div>
            <Grid cols="halves" gap={4} className="xl:grid-cols-2">
              {ordered.map((car) => (
                <CarCard key={car.id} car={car} highlighted={car.id === selectedId} />
              ))}
            </Grid>
          </Stack>
        </Split>
      </Container>
      <PublicFooter />
    </div>
  );
}

/** Suspended dealer: header only + the call message. */
export function SuspendedDealerScreen({ brand }: { brand: string }) {
  const t = useTranslations("publicPage");
  return (
    <div {...brandScope(brand)} className="bg-ground">
      <PublicHeader />
      <Container className="py-10">
        <Card variant="sunk" pad="lg" className="max-w-narrow">
          <Text size="lead" tone="strong">
            {t("unavailable", { phone: dealer.phone })}
          </Text>
        </Card>
      </Container>
    </div>
  );
}

/** app.drivebook.si — dealer admin, cars list (Owner/Salesperson). */
export function AdminCarsScreen() {
  const t = useTranslations();
  const nav = [
    { href: "#", label: t("nav.cars"), current: true },
    { href: "#", label: t("nav.settings") },
    { href: "#", label: t("nav.users") },
    { href: "#", label: t("nav.account") },
  ];
  return (
    <AppShell
      surface={dealer.name}
      nav={nav}
      skipLabel={t("nav.skipToContent")}
      navLabel={t("nav.primary")}
      containerSize="wide"
      user={
        <>
          <span className="hidden text-small text-muted lg:inline">Peter Novak</span>
          <Button variant="quiet" size="sm">
            {t("nav.logout")}
          </Button>
        </>
      }
    >
      <Stack gap={6}>
        <PageHeader
          eyebrow={`${dealer.slug}.${dealer.baseDomain}`}
          title={t("nav.cars")}
          description={t("publicPage.carsCount", { count: cars.length })}
          actions={
            <>
              <Button variant="secondary">{t("car.autofill")}</Button>
              <Button>+ {t("car.add")}</Button>
            </>
          }
        />
        <div className="flex flex-wrap gap-2">
          <Badge shape="pill" tone="solid">
            {t("status.active")} · 5
          </Badge>
          <Badge shape="pill">{t("status.inactive")} · 1</Badge>
        </div>
        <Grid cols="tiles" gap={4} className="xl:grid-cols-4">
          {cars.slice(0, 4).map((car) => (
            <CarCard key={car.id} car={car} deepLink={deepLink(car.id)} />
          ))}
        </Grid>
      </Stack>
    </AppShell>
  );
}
