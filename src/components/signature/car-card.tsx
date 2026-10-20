import { useFormatter, useTranslations } from "next-intl";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/badge";
import { CopyLink } from "./copy-link";

export type CarCardData = {
  id: string;
  make: string;
  model: string;
  year: number;
  priceEur: number;
  imageUrl?: string | null;
  avtoNetUrl?: string | null;
  active?: boolean;
};

/**
 * The car as the customer meets it on the dealer page (?car= highlights it),
 * and — with `deepLink` — as the dealer manages it in the admin.
 * Brand-aware: highlight and link colours follow the dealer's --brand.
 */
export function CarCard({
  car,
  highlighted = false,
  deepLink,
  className,
}: {
  car: CarCardData;
  highlighted?: boolean;
  /** Admin only: the shareable `{slug}.{BASE_DOMAIN}/?car={id}` link. */
  deepLink?: string;
  className?: string;
}) {
  const t = useTranslations();
  const format = useFormatter();
  const inactive = car.active === false;

  return (
    <article
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-md border bg-surface",
        "transition-[border-color,box-shadow] duration-[var(--motion-base)] ease-out",
        highlighted ? "border-brand shadow-2 ring-2 ring-brand-line" : "border-line hover:border-line-strong hover:shadow-1",
        inactive && "opacity-70",
        className,
      )}
    >
      <div className="relative aspect-[4/3] bg-surface-sunk">
        {car.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- local storage URLs, already resized to WebP
          <img src={car.imageUrl} alt={`${car.make} ${car.model}`} loading="lazy" className="size-full object-cover" />
        ) : (
          <CarPlaceholder label={t("car.noImage")} />
        )}
        {highlighted ? (
          <span className="absolute left-0 top-3 bg-brand px-2.5 py-1 font-mono text-micro font-medium uppercase tracking-utility text-brand-ink">
            {t("car.selected")}
          </span>
        ) : null}
        {inactive ? (
          <Badge tone="solid" className="absolute right-3 top-3">
            {t("status.inactive")}
          </Badge>
        ) : null}
      </div>

      <div className={cn("flex flex-1 flex-col gap-3 p-4", highlighted && "bg-brand-soft")}>
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-display text-h4 font-semibold leading-snug text-ink">
            {car.make} <span className="font-medium">{car.model}</span>
          </h3>
          <span className="mt-1 shrink-0 font-mono text-caption tabular text-muted">{car.year}</span>
        </div>
        <p className="font-display text-h3 font-semibold leading-none tabular text-ink">
          {format.number(car.priceEur, { style: "currency", currency: "EUR", maximumFractionDigits: 0 })}
        </p>
        <div className="mt-auto flex flex-col gap-3 pt-1">
          {car.avtoNetUrl ? (
            <a
              href={car.avtoNetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-small font-semibold text-ink underline decoration-brand decoration-2 underline-offset-4 hover:decoration-ink"
            >
              {t("car.viewOnAvtoNet")}
              <span aria-hidden>↗</span>
            </a>
          ) : null}
          {deepLink ? <CopyLink url={deepLink} label={t("car.deepLink")} /> : null}
        </div>
      </div>
    </article>
  );
}

/** Line-drawn hatchback on the sunk surface — the "no photo yet" state. */
export function CarPlaceholder({ label }: { label: string }) {
  return (
    <div className="flex size-full flex-col items-center justify-center gap-2 text-faint">
      <svg viewBox="0 0 120 48" className="w-1/2 max-w-40" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path
          d="M6 36 V28 C6 25 8 23 11 22 L30 18 L44 8 C46 7 48 6 51 6 H78 C82 6 85 7 88 10 L100 20 L110 23 C113 24 114 26 114 29 V36"
          strokeLinejoin="round"
        />
        <path d="M6 36 H18 M38 36 H82 M102 36 H114" />
        <circle cx="28" cy="36" r="8" />
        <circle cx="92" cy="36" r="8" />
        <path d="M46 18 L54 10 H66 V18 Z M72 10 H82 L92 18 H72 Z" strokeLinejoin="round" />
      </svg>
      <span className="font-mono text-micro uppercase tracking-utility">{label}</span>
    </div>
  );
}
