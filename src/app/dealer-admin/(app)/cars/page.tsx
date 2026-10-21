import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CarCard } from "@/components/signature";
import { Button, ButtonLink, Card, Container, Grid, PageHeader, Pill, Stack, Text } from "@/components/ui";
import { carDeepLink } from "@/lib/car-link";
import { getSurfaceBasePath, requireDealerUser } from "@/server/auth/permissions";
import { listCarsForAdmin } from "@/server/data/cars";
import { setCarActiveAction } from "./actions";
import { CAR_STATUS_FILTERS, parseCarStatusFilter } from "./form-model";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("cars"))("title") };
}

type Props = { searchParams?: Promise<Record<string, string | string[] | undefined>> };

export default async function CarsPage({ searchParams }: Props) {
  const { ctx } = await requireDealerUser();
  const [query, basePath, t] = await Promise.all([searchParams, getSurfaceBasePath(), getTranslations("cars")]);
  const status = parseCarStatusFilter(query?.status);
  const cars = await listCarsForAdmin(ctx, { status });
  const listHref = `${basePath}/cars`;
  const addHref = `${listHref}/new`;
  const labels = {
    listing: t("listing"),
    active: t("status.active"),
    inactive: t("status.inactive"),
    deepLink: t("deepLink"),
    copy: t("copy"),
    copied: t("copied"),
  };

  return (
    <Container className="py-10 md:py-16">
      <Stack gap={8}>
        <PageHeader
          title={t("title")}
          description={t("description")}
          actions={
            cars.length > 0 ? (
              <ButtonLink variant="primary" href={addHref} data-testid="car-add">
                {t("add")}
              </ButtonLink>
            ) : undefined
          }
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <nav aria-label={t("filterLabel")} className="flex flex-wrap gap-2" data-testid="cars-filter">
            {CAR_STATUS_FILTERS.map((s) => (
              <a
                key={s}
                href={`${listHref}?status=${s}`}
                aria-current={s === status ? "page" : undefined}
                className="rounded-pill"
                data-testid={`cars-filter-${s}`}
              >
                <Pill active={s === status}>{t(`filters.${s}`)}</Pill>
              </a>
            ))}
          </nav>
          <Text size="small" tone="muted" data-testid="cars-count">
            {t("count", { count: cars.length })}
          </Text>
        </div>
        {cars.length === 0 ? (
          <Card tone="sunken" data-testid="cars-empty">
            <Stack gap={4} className="items-start">
              <Text>{t(`empty.${status}`)}</Text>
              <ButtonLink variant="primary" href={addHref} data-testid="car-add">
                {t("add")}
              </ButtonLink>
            </Stack>
          </Card>
        ) : (
          <section aria-label={t("listTitle")} data-testid="cars-list">
            <Grid cols={2} from="md" className="xl:grid-cols-3">
              {cars.map((car) => (
                <div key={car.id} className="min-w-0" data-testid="car-row" data-car-id={car.id} data-active={car.active}>
                  <CarCard
                    car={car}
                    showStatus
                    deepLink={carDeepLink(ctx.slug, car.id)}
                    labels={labels}
                    actions={
                      <>
                        <ButtonLink variant="secondary" size="sm" href={`${listHref}/${car.id}`} data-testid="car-edit">
                          {t("edit")}
                        </ButtonLink>
                        <form action={setCarActiveAction}>
                          <input type="hidden" name="id" value={car.id} />
                          <input type="hidden" name="active" value={car.active ? "0" : "1"} />
                          <Button
                            type="submit"
                            variant={car.active ? "danger" : "secondary"}
                            size="sm"
                            data-testid={car.active ? "car-deactivate" : "car-reactivate"}
                          >
                            {t(car.active ? "deactivate" : "reactivate")}
                          </Button>
                        </form>
                      </>
                    }
                  />
                </div>
              ))}
            </Grid>
          </section>
        )}
      </Stack>
    </Container>
  );
}
