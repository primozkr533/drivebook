import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { DriveTicket } from "@/components/signature";
import { ButtonLink, Container, Grid, Stack, Text } from "@/components/ui";
import { formatDateShort, formatTime, ticketDateParts } from "@/lib/date";
import { getPublicBooking } from "@/server/data/bookings";
import { resolveDealerSlug } from "@/server/data/dealers";
import { BASE_PATH_HEADER } from "@/server/routing";
import { DealerSiteShell } from "../../DealerSiteShell";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string; bookingId: string }> };

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("booking"))("confirmation.title"), robots: { index: false } };
}

const int = new Intl.NumberFormat("sl-SI", { maximumFractionDigits: 0 });

export default async function BookingConfirmationPage({ params }: Props) {
  const [{ slug, bookingId }, h, t] = await Promise.all([params, headers(), getTranslations("booking")]);
  const resolved = await resolveDealerSlug(slug);
  if (resolved.kind !== "current") notFound();
  const { ctx, dealer } = resolved;
  const booking = await getPublicBooking(ctx, bookingId);
  if (!booking) notFound();
  const basePath = h.get(BASE_PATH_HEADER) ?? "";
  const cancelled = booking.status === "cancelled";

  const cutoff = new Date(booking.startsAt.getTime() - booking.cancelCutoffMinutes * 60_000);
  const cutoffArgs = { date: formatDateShort(cutoff), time: formatTime(cutoff) };
  const carMeta = [booking.car.year?.toString(), booking.car.mileageKm != null ? `${int.format(booking.car.mileageKm)} km` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <DealerSiteShell dealer={dealer} basePath={basePath} compact>
      <Container className="py-8 md:py-12">
        <Grid cols={12} from="lg" gap="lg">
          <Stack gap={6} className="lg:col-span-8">
            <Stack gap={3}>
              <h1 className="type-display text-h1 text-ink text-balance" data-testid="confirmation-title">
                {cancelled ? t("confirmation.cancelledTitle") : t("confirmation.title")}
              </h1>
              <Text size="lead">
                {cancelled ? t("confirmation.cancelledBody") : t("confirmation.body", { phone: booking.customerPhone })}
              </Text>
            </Stack>
            <DriveTicket
              statusLabel={t(`confirmation.status.${booking.status}`)}
              labels={{
                customer: t("confirmation.customer"),
                phone: t("confirmation.phone"),
                verified: t("confirmation.verified"),
                code: t("confirmation.code"),
              }}
              animate={!cancelled}
              t={{
                kind: t(`kind.${booking.kind}`),
                dealer: dealer.name,
                car: `${booking.car.make} ${booking.car.model}`,
                carMeta,
                ...ticketDateParts(booking.startsAt),
                start: formatTime(booking.startsAt),
                end: formatTime(booking.endsAt),
                customer: booking.customerName,
                phone: booking.customerPhone,
                phoneVerified: false,
                code: booking.code,
                cutoffNote: cancelled ? "" : t(dealer.phone.trim() ? "confirmation.cutoff" : "confirmation.cutoffNoPhone", cutoffArgs),
                status: cancelled ? "cancelled" : "confirmed",
              }}
            />
            <div>
              <ButtonLink href={`${basePath}/`} variant="secondary">
                {t("confirmation.another")}
              </ButtonLink>
            </div>
          </Stack>
        </Grid>
      </Container>
    </DealerSiteShell>
  );
}
