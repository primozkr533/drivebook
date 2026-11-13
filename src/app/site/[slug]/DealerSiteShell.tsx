import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { ButtonLink, Container, Heading, Shell, Text } from "@/components/ui";
import { dealerAddress } from "@/lib/address";
import { brandStyle } from "@/lib/color";
import type { PublicDealer } from "@/server/data/dealers";
import { mapsHref, privacyLink, telHref } from "./model";

/**
 * The public dealer site's frame (brand band header with contacts, footer with the privacy link),
 * shared by the dealer page and the booking pages. `homeHref` makes the dealer name a link home.
 */
export async function DealerSiteShell({
  dealer,
  basePath,
  homeHref,
  compact = false,
  children,
}: {
  dealer: PublicDealer;
  basePath: string;
  homeHref?: string;
  compact?: boolean;
  children: ReactNode;
}) {
  const t = await getTranslations("dealerPage");
  const phone = dealer.phone.trim();
  const email = dealer.email.trim();
  const address = dealerAddress(dealer);
  const maps = mapsHref(dealer);
  const privacy = privacyLink(dealer.privacyPolicyUrl, basePath);

  const name = dealer.logoUrl ? (
    // The stored-file URL is app-relative and served on every host, so no base-path prefix.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={dealer.logoUrl}
      alt={dealer.name}
      width={256}
      height={64}
      decoding="async"
      className={compact ? "h-10 w-40 max-w-full object-contain object-left" : "h-16 w-64 max-w-full object-contain object-left"}
    />
  ) : (
    dealer.name
  );

  const header = (
    <header className="relative border-b border-line-strong">
      <span aria-hidden className="absolute inset-x-0 top-0 h-1.5 bg-brand" />
      <Container className={compact ? "flex flex-col gap-4 pb-4 pt-6 md:flex-row md:items-center md:justify-between" : "flex flex-col gap-6 pb-6 pt-8 md:flex-row md:items-end md:justify-between"}>
        <div className="flex items-center gap-4">
          <div className="min-w-0">
            {compact ? (
              <a href={homeHref ?? `${basePath}/`} className="text-h3 font-[800] text-ink hover:text-ink-2">
                {name}
              </a>
            ) : (
              <Heading size="d1">{name}</Heading>
            )}
            {!compact && address && (
              <address className="mt-1 not-italic">
                {address.line && <Text>{address.line}</Text>}
                {address.locality && <Text>{address.locality}</Text>}
              </address>
            )}
          </div>
        </div>
        {(phone || email || maps) && (
          <div className="flex flex-wrap items-center gap-3">
            {phone && (
              <ButtonLink href={telHref(phone)} variant={compact ? "secondary" : "brand"} size={compact ? "sm" : "md"}>
                {t("call")} <span className="tabular">{phone}</span>
              </ButtonLink>
            )}
            {!compact && email && (
              <ButtonLink href={`mailto:${email}`} variant="quiet">
                {email}
              </ButtonLink>
            )}
            {!compact && maps && (
              <ButtonLink href={maps} variant="quiet" target="_blank" rel="noopener noreferrer">
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
          href={privacy.href}
          className="text-ink-2 underline underline-offset-4"
          {...(privacy.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        >
          {t("privacy")}
        </a>
      </Container>
    </footer>
  );

  return (
    <div style={brandStyle(dealer.primaryColor)}>
      <Shell header={header} footer={footer}>
        {children}
      </Shell>
    </div>
  );
}
