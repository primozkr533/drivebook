import type { ReactNode } from "react";
import { cx } from "@/lib/cx";
import { Badge } from "@/components/ui/Badge";
import { CarSilhouette } from "./CarSilhouette";
import { CopyLink } from "./CopyLink";

export type Car = {
  id: string;
  make: string;
  model: string;
  trim?: string;
  year?: number;
  mileageKm?: number;
  priceEur?: number;
  imageUrl?: string;
  body?: "estate" | "sedan" | "suv";
  avtoNetUrl: string;
  /** Dealer's note for customers. */
  notes?: string;
  active?: boolean;
};

export type CarCardLabels = { selected: string; listing: string; inactive: string; km?: string };

const eur = new Intl.NumberFormat("sl-SI", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const int = new Intl.NumberFormat("sl-SI", { maximumFractionDigits: 0 });

/**
 * CarCard — the public page's unit. `selected` = arrived via ?car={id}
 * (shown first, signal-framed). `deepLink` (admin) adds the copyable URL.
 * `action` is the card's call to action (e.g. the public "book" button), rendered last.
 */
export function CarCard({
  car,
  selected = false,
  deepLink,
  action,
  labels = { selected: "Izbrano vozilo", listing: "Oglej si oglas na avto.net", inactive: "Neaktivno", km: "km" },
}: {
  car: Car;
  selected?: boolean;
  deepLink?: string;
  action?: ReactNode;
  labels?: CarCardLabels;
}) {
  const inactive = car.active === false;
  return (
    <article
      className={cx(
        "group/car relative flex flex-col bg-surface",
        selected ? "shadow-[inset_0_0_0_2px_var(--brand),6px_6px_0_0_var(--brand)]" : "shadow-[inset_0_0_0_1px_var(--line)]",
        inactive && "opacity-60 grayscale",
      )}
    >
      {selected && (
        <span className="type-utility absolute left-0 top-0 z-10 bg-brand px-2.5 py-1.5 text-on-brand">{labels.selected}</span>
      )}
      <div className="relative aspect-[16/10] overflow-hidden bg-surface-2">
        {car.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={car.imageUrl} alt="" className="size-full object-cover" loading="lazy" />
        ) : (
          <div className="grid size-full place-items-center p-6">
            <CarSilhouette body={car.body} className="w-4/5 max-w-[16rem] transition-transform duration-[var(--dur-base)] ease-out group-hover/car:translate-x-1" />
          </div>
        )}
        {car.year !== undefined && (
          <span className="type-utility absolute bottom-0 right-0 bg-ink px-2 py-1 tabular text-ground">{car.year}</span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="type-utility text-muted">{car.make}</p>
            <h3 className="mt-1 text-h3 font-[700] text-ink">{car.model}</h3>
            {car.trim && <p className="mt-0.5 truncate text-small text-ink-2">{car.trim}</p>}
            {car.mileageKm !== undefined && (
              <p className="type-utility mt-2 tabular text-ink-2">
                {int.format(car.mileageKm)} {labels.km ?? "km"}
              </p>
            )}
          </div>
          {inactive && <Badge tone="neutral">{labels.inactive}</Badge>}
        </div>
        {car.notes && <p className="whitespace-pre-line text-small text-ink-2">{car.notes}</p>}
        <div className="mt-auto flex flex-wrap items-end justify-between gap-3 border-t border-line pt-4">
          {car.priceEur !== undefined ? (
            <span className="type-display text-h2 tabular text-ink">{eur.format(car.priceEur)}</span>
          ) : (
            <span />
          )}
          <a
            href={car.avtoNetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-small font-[600] text-ink underline decoration-line decoration-2 underline-offset-4 hover:decoration-brand"
          >
            {labels.listing}
            <svg viewBox="0 0 12 12" aria-hidden className="size-3">
              <path d="M3 9l6-6M4 3h5v5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="square" />
            </svg>
          </a>
        </div>
        {action}
        {deepLink && <CopyLink url={deepLink} />}
      </div>
    </article>
  );
}
