import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CarSilhouette, CopyLink } from "@/components/signature";
import { Badge, Button, ButtonLink, Card, Container, Grid, PageHeader, Pill, Stack, Text } from "@/components/ui";
import { carDeepLink } from "@/lib/car-link";
import { getSurfaceBasePath, requireDealerUser } from "@/server/auth/permissions";
import { listCarsForAdmin, type AdminCar } from "@/server/data/cars";
import { setCarActiveAction } from "./actions";
import { CAR_STATUS_FILTERS, parseCarStatusFilter } from "./form-model";

const eur = new Intl.NumberFormat("sl-SI", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

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

  const carCard = (car: AdminCar) => (
    <Card pad="none" className="flex h-full flex-col" data-testid="car-row" data-car-id={car.id} data-active={car.active}>
      <div className="relative aspect-[16/10] overflow-hidden bg-surface-2">
        {car.imageUrl ? (
          // An app-relative /api/files/… path: used as-is, without the surface base path.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={car.imageUrl} alt="" className="size-full object-cover" loading="lazy" data-testid="car-image" />
        ) : (
          <div className="grid size-full place-items-center p-6" data-testid="car-silhouette">
            <CarSilhouette body={car.body} className="w-4/5 max-w-64" />
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="type-utility text-muted">{car.make}</p>
            <h2 className="mt-1 text-h3 font-[700] text-ink" data-testid="car-model">
              {car.model}
            </h2>
          </div>
          <span data-testid="car-status" data-status={car.active ? "active" : "inactive"}>
            <Badge tone={car.active ? "ok" : "neutral"}>{t(car.active ? "status.active" : "status.inactive")}</Badge>
          </span>
        </div>
        <dl className="grid grid-cols-2 gap-3 border-t border-line pt-4">
          <div>
            <dt className="type-utility text-muted">{t("year")}</dt>
            <dd className="tabular text-body text-ink">{car.year}</dd>
          </div>
          <div>
            <dt className="type-utility text-muted">{t("price")}</dt>
            <dd className="tabular text-body font-[650] text-ink" data-testid="car-price">
              {eur.format(car.priceEur)}
            </dd>
          </div>
        </dl>
        <div className="flex flex-col gap-1.5" data-testid="car-deep-link">
          <span className="type-utility text-muted">{t("deepLink")}</span>
          <CopyLink url={carDeepLink(ctx.slug, car.id)} label={t("copy")} copiedLabel={t("copied")} />
        </div>
        <div className="mt-auto flex flex-wrap items-center gap-3 pt-2">
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
        </div>
      </div>
    </Card>
  );

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
                <div key={car.id} className="min-w-0">
                  {carCard(car)}
                </div>
              ))}
            </Grid>
          </section>
        )}
      </Stack>
    </Container>
  );
}
