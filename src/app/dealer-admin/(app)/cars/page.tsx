import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Badge, ButtonLink, Card, CardHeader, Container, Grid, PageHeader, Stack, Text } from "@/components/ui";
import { CarSilhouette } from "@/components/signature";
import { getSurfaceBasePath, requireDealerUser } from "@/server/auth/permissions";
import { countUpcomingBookingsByCar } from "@/server/data/bookings";
import { listCarsForAdmin, type AdminCar, type CarField } from "@/server/data/cars";
import { addCarAction, deleteCarAction, setCarActiveAction, updateCarAction, type CarFormValues } from "./actions";
import { AddCarForm, CarActiveSwitch, DeleteCarButton, EditCarForm, type CarFormLabels } from "./CarForms";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("cars"))("nav") };
}

const int = new Intl.NumberFormat("sl-SI", { maximumFractionDigits: 0 });
const eur = new Intl.NumberFormat("sl-SI", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

function formValues(car: AdminCar): CarFormValues {
  return {
    avtoNetUrl: car.avtoNetUrl,
    notes: car.notes ?? "",
    make: car.make,
    model: car.model,
    year: car.year?.toString() ?? "",
    mileageKm: car.mileageKm?.toString() ?? "",
    priceEur: car.priceEur?.toString() ?? "",
  };
}

export default async function CarsPage() {
  const { ctx } = await requireDealerUser();
  const [t, basePath, cars] = await Promise.all([getTranslations("cars"), getSurfaceBasePath(), listCarsForAdmin(ctx)]);
  const upcoming = await countUpcomingBookingsByCar(
    ctx,
    cars.map((c) => c.id),
  );

  const actionErrors = { forbidden: t("errors.forbidden"), readOnly: t("errors.readOnly"), hasBookings: t("errors.hasBookings") };
  const common = {
    required: t("errors.required"),
    invalid: t("errors.invalid"),
    too_long: t("errors.too_long"),
    out_of_range: t("errors.out_of_range"),
    taken: t("errors.taken"),
  };
  const fields: CarField[] = ["avtoNetUrl", "notes", "make", "model", "year", "mileageKm", "priceEur"];
  const labels: CarFormLabels = {
    fields: Object.fromEntries(fields.map((f) => [f, t(`add.fields.${f}`)])) as Record<CarField, string>,
    optional: t("add.optional"),
    urlPlaceholder: t("add.urlPlaceholder"),
    notesPlaceholder: t("add.notesPlaceholder"),
    submit: t("add.submit"),
    added: t("add.added"),
    addedManual: t("add.addedManual"),
    manualTitle: t("add.manualTitle"),
    manualBody: t("add.manualBody"),
    save: t("list.save"),
    saved: t("list.saved"),
    fieldErrors: {
      ...(Object.fromEntries(fields.map((f) => [f, common])) as CarFormLabels["fieldErrors"]),
      avtoNetUrl: { ...common, invalid: t("errors.invalidUrl") },
    },
    errors: actionErrors,
  };

  const meta = (car: AdminCar) =>
    [car.year?.toString(), car.mileageKm !== undefined ? `${int.format(car.mileageKm)} ${t("list.km")}` : null, car.priceEur !== undefined ? eur.format(car.priceEur) : null]
      .filter(Boolean)
      .join(" · ");

  return (
    <Container className="py-10 md:py-16">
      <Stack gap={8}>
        <PageHeader title={t("title")} description={t("description")} />
        <Card data-testid="cars-add">
          <CardHeader title={t("add.title")} />
          <AddCarForm action={addCarAction} labels={labels} />
        </Card>

        <Stack gap={4}>
          <h2 className="text-h2 font-[700] text-ink">{t("list.title")}</h2>
          {cars.length === 0 ? (
            <Card tone="sunken">
              <Text data-testid="cars-empty">{t("list.empty")}</Text>
            </Card>
          ) : (
            <ul className="flex flex-col gap-4" data-testid="cars-list">
              {cars.map((car) => {
                const label = `${car.make} ${car.model}`;
                return (
                  <li key={car.id} data-testid={`car-${car.id}`}>
                    <Card>
                      <Grid cols={12} from="lg" gap="md">
                        <div className="flex gap-4 lg:col-span-7">
                          <div className="hidden aspect-[16/10] w-36 shrink-0 overflow-hidden bg-surface-2 sm:block">
                            {car.imageUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={car.imageUrl} alt="" className="size-full object-cover" loading="lazy" />
                            ) : (
                              <div className="grid size-full place-items-center p-3">
                                <CarSilhouette body={car.body} className="w-full" />
                              </div>
                            )}
                          </div>
                          <div className="flex min-w-0 flex-col gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-h3 font-[700] text-ink">{label}</span>
                              <Badge tone={car.active ? "ok" : "neutral"}>{car.active ? t("list.visible") : t("list.hidden")}</Badge>
                            </div>
                            {meta(car) && <span className="type-utility tabular text-ink-2">{meta(car)}</span>}
                            {car.notes && <Text size="small" className="whitespace-pre-line">{car.notes}</Text>}
                            <div className="flex flex-wrap gap-x-5 gap-y-1">
                              <a
                                href={car.avtoNetUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-small font-[600] text-ink underline decoration-line decoration-2 underline-offset-4 hover:decoration-signal"
                              >
                                {t("list.listing")}
                              </a>
                              <a
                                href={`${basePath}/bookings?car=${car.id}`}
                                className="text-small font-[600] text-ink underline decoration-line decoration-2 underline-offset-4 hover:decoration-signal"
                              >
                                {t("list.bookings")}: {t("list.upcoming", { count: upcoming.get(car.id) ?? 0 })}
                              </a>
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col gap-4 lg:col-span-5">
                          <CarActiveSwitch
                            action={setCarActiveAction}
                            id={car.id}
                            active={car.active !== false}
                            labels={{ label: t("list.showOnPage"), hint: t("list.showOnPageHint"), errors: actionErrors }}
                          />
                          {car.bookingCount === 0 && (
                            <DeleteCarButton
                              action={deleteCarAction}
                              id={car.id}
                              labels={{ submit: t("list.delete"), ariaLabel: t("list.deleteLabel", { car: label }), errors: actionErrors }}
                            />
                          )}
                        </div>
                      </Grid>
                      <details className="mt-5 border-t border-dashed border-line pt-4">
                        <summary className="cursor-pointer text-small font-[650] text-ink" data-testid={`car-edit-${car.id}`}>
                          {t("list.edit")}
                        </summary>
                        <div className="pt-5">
                          <EditCarForm action={updateCarAction} id={car.id} initial={formValues(car)} labels={labels} />
                        </div>
                      </details>
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}
        </Stack>
        <div>
          <ButtonLink href={`${basePath}/bookings`} variant="secondary">
            {t("list.bookings")}
          </ButtonLink>
        </div>
      </Stack>
    </Container>
  );
}
