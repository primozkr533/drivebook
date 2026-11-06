import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { DriveTicket } from "@/components/signature";
import { ButtonLink, Card, Container, Grid, Stack, Text } from "@/components/ui";
import { formatDateShort, formatTime, ticketDateParts } from "@/lib/date";
import { getPublicBooking } from "@/server/data/bookings";
import { resolveDealerSlug } from "@/server/data/dealers";
import { BASE_PATH_HEADER } from "@/server/routing";
import { DealerSiteShell } from "../../DealerSiteShell";
import { resendCodeAction, verifyBookingAction } from "./actions";
import { VerifyForm } from "./VerifyForm";

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
  const verification = booking.verification;
  // pending → waiting for the SMS code; expired → the hold ended and the slot is free again.
  const state =
    booking.status === "cancelled" ? "cancelled" : verification ? (verification.expired ? "expired" : "pending") : "confirmed";
  const cancelled = state === "cancelled" || state === "expired";
  const title = { confirmed: t("confirmation.title"), pending: t("verify.title"), expired: t("verify.expiredTitle"), cancelled: t("confirmation.cancelledTitle") }[state];
  const body = {
    confirmed: t("confirmation.body", { phone: booking.customerPhone }),
    pending: t("verify.body", { phone: booking.customerPhone, minutes: Math.max(1, Math.ceil(((verification?.expiresAt.getTime() ?? 0) - Date.now()) / 60_000)) }),
    expired: t("verify.expiredBody"),
    cancelled: t("confirmation.cancelledBody"),
  }[state];

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
              <h1 className="type-display text-h1 text-ink text-balance" data-testid="confirmation-title" data-state={state}>
                {title}
              </h1>
              <Text size="lead">{body}</Text>
            </Stack>
            {state === "pending" && (
              <Card data-testid="verify-card">
                <VerifyForm
                  verifyAction={verifyBookingAction.bind(null, slug, booking.id)}
                  resendAction={resendCodeAction.bind(null, slug, booking.id)}
                  labels={{
                    code: t("verify.code"),
                    codeHint: t("verify.codeHint"),
                    submit: t("verify.submit"),
                    resend: t("verify.resend"),
                    wrongCode: t.raw("verify.wrongCode") as string,
                    unavailable: t("verify.unavailable"),
                    resent: {
                      ok: t("verify.resent.ok"),
                      too_soon: t("verify.resent.too_soon"),
                      limit: t("verify.resent.limit"),
                      expired: t("verify.resent.expired"),
                    },
                  }}
                />
              </Card>
            )}
            <DriveTicket
              statusLabel={t(`confirmation.status.${state}`)}
              labels={{
                customer: t("confirmation.customer"),
                phone: t("confirmation.phone"),
                verified: t("confirmation.verified"),
                code: t("confirmation.code"),
              }}
              animate={state === "confirmed"}
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
                phoneVerified: booking.phoneVerified,
                // Until confirmed, the booking code would be confused with the SMS code.
                code: state === "pending" ? "—" : booking.code,
                cutoffNote: state !== "confirmed" ? "" : t(dealer.phone.trim() ? "confirmation.cutoff" : "confirmation.cutoffNoPhone", cutoffArgs),
                status: state === "confirmed" ? "confirmed" : state === "pending" ? "pending" : "cancelled",
              }}
            />
            {state !== "pending" && (
            <div>
              <ButtonLink href={`${basePath}/`} variant="secondary">
                {cancelled ? t("verify.bookAgain") : t("confirmation.another")}
              </ButtonLink>
            </div>
            )}
          </Stack>
        </Grid>
      </Container>
    </DealerSiteShell>
  );
}
