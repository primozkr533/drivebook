import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Container, Kicker, Rule, TextLink } from "@/components/ui";

/* ── DealerMasthead ───────────────────────────────────────────────────────
 * SIGNATURE. The top of every public dealer page: the dealer gets its own
 * magazine cover. Utility strip → name set large in the display serif →
 * a brand-coloured rule that draws in once → a colophon of the facts a
 * customer needs (address, phone, today's hours, map).
 * Wrap the page in brandStyle(dealer.primaryColor) and it re-skins itself. */

export type MastheadFact = { label: ReactNode; value: ReactNode };

export function DealerMasthead({
  name,
  strap,
  host,
  logoSrc,
  monogram,
  facts,
  className,
  style,
}: {
  name: ReactNode;
  /** Utility strip copy, e.g. "Testne vožnje in ogledi". */
  strap: ReactNode;
  /** e.g. "novak.drivebook.si" */
  host: ReactNode;
  logoSrc?: string;
  /** Fallback when there is no logo, e.g. "AN". */
  monogram: string;
  facts: MastheadFact[];
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <header className={cn("@container bg-ground pt-4 text-ink", className)} style={style}>
      <Container>
        <div className="flex items-center justify-between gap-4 border-b border-line pb-3">
          <Kicker>{strap}</Kicker>
          <Kicker className="hidden @lg:inline-flex">{host}</Kicker>
        </div>

        <div className="flex items-center gap-5 pt-8 pb-6 @xl:gap-8 @4xl:pt-14 @4xl:pb-8">
          <DealerLogo src={logoSrc} monogram={monogram} />
          <h1 className="min-w-0 font-display text-3xl tracking-display font-[400] text-ink [&_em]:font-[300] [&_em]:italic">
            {name}
          </h1>
        </div>

        <Rule weight="brand" draw />

        <dl className="grid grid-cols-2 gap-x-6 gap-y-5 py-6 @4xl:grid-cols-4 @4xl:gap-0 @4xl:divide-x @4xl:divide-line">
          {facts.map((fact, i) => (
            <div key={i} className="flex min-w-0 flex-col gap-1.5 @4xl:px-6 @4xl:first:pl-0">
              <dt>
                <Kicker>{fact.label}</Kicker>
              </dt>
              <dd className="text-sm font-medium text-ink @xl:text-base">{fact.value}</dd>
            </div>
          ))}
        </dl>
      </Container>
    </header>
  );
}

function DealerLogo({ src, monogram }: { src?: string; monogram: string }) {
  const box = "size-16 shrink-0 @xl:size-20 @4xl:size-24";
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" className={cn(box, "object-contain")} />;
  }
  return (
    <span
      aria-hidden
      className={cn(
        box,
        "flex items-center justify-center bg-brand font-display text-xl italic font-[300] text-brand-ink @4xl:text-2xl",
      )}
    >
      {monogram}
    </span>
  );
}

/** Phone value for the colophon — always a tel: link. */
export function PhoneLink({ phone }: { phone: string }) {
  return (
    <a href={`tel:${phone.replace(/\s/g, "")}`} className="tabular-nums hover:text-brand">
      {phone}
    </a>
  );
}

/** Map value for the colophon. */
export function MapLink({ href, label }: { href: string; label: ReactNode }) {
  return (
    <TextLink href={href} external>
      {label}
    </TextLink>
  );
}

/* ── DealerFooter ─ privacy link + platform credit. ───────────────────── */

export function DealerFooter({ privacy, credit }: { privacy: ReactNode; credit: ReactNode }) {
  return (
    <footer className="mt-section border-t border-line py-8">
      <Container className="flex flex-col gap-3 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
        <span>{privacy}</span>
        <span className="font-utility text-caption uppercase tracking-utility">{credit}</span>
      </Container>
    </footer>
  );
}
