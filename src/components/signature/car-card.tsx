import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Figure, Heading, Kicker, TextLink } from "@/components/ui";
import { formatEur } from "@/lib/format";

/* ── CarCard ──────────────────────────────────────────────────────────────
 * SIGNATURE. A car presented like a feature spread, not a classified ad.
 * `featured` is the ?car={id} state: the car a customer arrived for —
 * full-width spread, brand rule, room for the phase-2 booking action.     */

export type CarCardData = {
  id: string;
  make: string;
  model: string;
  /** Trim/engine line, optional: "2.0 TDI Style" */
  variant?: string;
  year: number;
  priceEur: number;
  imageSrc?: string;
  avtoNetUrl?: string;
};

type CarCardLabels = {
  /** "Oglej si oglas na avto.net" */
  viewListing: ReactNode;
  /** "Izbrano vozilo" */
  featured?: ReactNode;
  /** "Fotografija ni na voljo" */
  noPhoto: ReactNode;
  /** "Letnik", "Cena" — featured spread data labels */
  year?: ReactNode;
  price?: ReactNode;
};

export function CarCard({
  car,
  labels,
  featured,
  priority,
  action,
  className,
}: {
  car: CarCardData;
  labels: CarCardLabels;
  featured?: boolean;
  /** Load the image eagerly (above the fold). Featured cards always do. */
  priority?: boolean;
  /** Phase 2: the "book this car" action goes here. */
  action?: ReactNode;
  className?: string;
}) {
  if (featured) {
    return (
      <article
        id={`car-${car.id}`}
        className={cn(
          "grid grid-cols-1 gap-6 border-t-(length:--rule-brand) border-brand pt-6 md:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] md:gap-gutter",
          className,
        )}
      >
        <CarImage car={car} noPhoto={labels.noPhoto} priority className="aspect-[4/3] md:order-last" />
        <div className="flex flex-col gap-5">
          {labels.featured && <Kicker tone="brand">{labels.featured}</Kicker>}
          <div className="flex flex-col gap-2">
            <Kicker tone="ink">{car.make}</Kicker>
            <Heading as="h2" size="2xl">
              {car.model}
            </Heading>
          </div>
          <dl className="grid grid-cols-2 border-y border-line">
            <div className="flex flex-col gap-1 border-r border-line py-4 pr-4">
              <dt>
                <Kicker>{labels.year}</Kicker>
              </dt>
              <dd>
                <Figure size="xl">{car.year}</Figure>
              </dd>
            </div>
            <div className="flex flex-col gap-1 py-4 pl-4">
              <dt>
                <Kicker>{labels.price}</Kicker>
              </dt>
              <dd>
                <Figure size="xl">{formatEur(car.priceEur)}</Figure>
              </dd>
            </div>
          </dl>
          {car.variant && <p className="font-display text-lg italic font-[300] text-ink-soft">{car.variant}</p>}
          <div className="mt-auto flex flex-wrap items-center gap-x-6 gap-y-3 pt-2">
            {action}
            {car.avtoNetUrl && (
              <TextLink href={car.avtoNetUrl} external className="text-sm font-medium">
                {labels.viewListing}
              </TextLink>
            )}
          </div>
        </div>
      </article>
    );
  }

  return (
    <article id={`car-${car.id}`} className={cn("group flex flex-col", className)}>
      <CarImage car={car} noPhoto={labels.noPhoto} priority={priority} className="aspect-[4/3]" />
      <div className="flex flex-1 flex-col gap-1.5 border-b border-line pt-4 pb-4">
        <div className="flex items-baseline justify-between gap-3">
          <Kicker tone="ink">{car.make}</Kicker>
          <Kicker className="tabular-nums">{car.year}</Kicker>
        </div>
        <Heading as="h3" size="lg">
          {car.model}
        </Heading>
        {car.variant && <p className="text-sm text-muted">{car.variant}</p>}
        <div className="mt-auto flex flex-col items-start gap-2 pt-3">
          <Figure size="lg">{formatEur(car.priceEur)}</Figure>
          {car.avtoNetUrl && (
            <TextLink href={car.avtoNetUrl} external className="text-xs font-medium text-ink-soft">
              {labels.viewListing}
            </TextLink>
          )}
        </div>
      </div>
    </article>
  );
}

/** Car photo, or a quiet plate when the dealer hasn't added one. */
export function CarImage({
  car,
  noPhoto,
  priority,
  className,
}: {
  car: Pick<CarCardData, "make" | "model" | "imageSrc">;
  noPhoto: ReactNode;
  /** Above-the-fold image (the featured car): load eagerly. */
  priority?: boolean;
  className?: string;
}) {
  if (car.imageSrc) {
    return (
      <div className={cn("overflow-hidden bg-sunken", className)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={car.imageSrc}
          alt={`${car.make} ${car.model}`}
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : undefined}
          className="size-full object-cover transition-transform duration-(--duration-slow) ease-out group-hover:scale-[1.02]"
        />
      </div>
    );
  }
  return (
    <div className={cn("@container relative flex items-center justify-center overflow-hidden bg-sunken", className)}>
      {/* Initial scales with the plate (container units), so it works from table thumbnail to hero. */}
      <span aria-hidden className="font-display text-[42cqw] leading-none italic font-[300] text-line">
        {car.make.charAt(0)}
      </span>
      <Kicker className="absolute bottom-3 left-3 @max-3xs:hidden">{noPhoto}</Kicker>
    </div>
  );
}
