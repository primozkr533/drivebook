import type { Car, DayHours } from "@/components/signature";
import { timeOfDay, timeToMinutes, weekdayShortSl, type IsoWeekday, type LjubljanaParts } from "@/lib/date";
import type { PublicDealer } from "@/server/data/dealers";
import type { OpeningHours } from "@/server/data/hours";
import { dealerAddress, type DealerAddress } from "@/lib/address";

export type DealerPageCar = { car: Car; selected: boolean };

export type DealerPageModel = {
  suspended: boolean;
  cars: DealerPageCar[];
  days: DayHours[];
  today: number;
  nowMin: number;
  phone: string | null;
  telHref: string | null;
  address: DealerAddress | null;
  mapsHref: string | null;
  privacy: { href: string; external: boolean };
};

const ISO_WEEKDAYS: IsoWeekday[] = [1, 2, 3, 4, 5, 6, 7];

export function telHref(phone: string): string {
  return `tel:${phone.replace(/\s+/g, "")}`;
}

export function mapsHref(
  dealer: Pick<PublicDealer, "name" | "addressLine" | "postalCode" | "city" | "mapsUrl">,
): string | null {
  const address = dealerAddress(dealer);
  if (!address) return null;
  if (dealer.mapsUrl) return dealer.mapsUrl;
  const query = [dealer.name.trim(), address.line, address.locality].filter(Boolean).join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function privacyLink(privacyUrl: string | null, basePath: string): { href: string; external: boolean } {
  if (privacyUrl) return { href: privacyUrl, external: true };
  return { href: `${basePath}/zasebnost`, external: false };
}

export function orderCars(cars: Car[], carParam: string | string[] | undefined): DealerPageCar[] {
  const active = cars.filter((c) => c.active !== false);
  const wanted = Array.isArray(carParam) ? carParam[0] : carParam;
  const hit = wanted ? active.find((c) => c.id === wanted) : undefined;
  if (!hit) return active.map((car) => ({ car, selected: false }));
  return [{ car: hit, selected: true }, ...active.filter((c) => c !== hit).map((car) => ({ car, selected: false }))];
}

export function weekDays(hours: OpeningHours[]): DayHours[] {
  return ISO_WEEKDAYS.map((d) => ({
    short: weekdayShortSl(d),
    ranges: hours
      .filter((h) => h.isoWeekday === d)
      .sort((a, b) => timeToMinutes(a.opensAt) - timeToMinutes(b.opensAt))
      .map((h): [string, string] => [timeOfDay(h.opensAt), timeOfDay(h.closesAt)]),
  }));
}

export function buildDealerPageModel({
  dealer,
  cars,
  hours,
  now,
  carParam,
  basePath,
}: {
  dealer: PublicDealer;
  cars: Car[];
  hours: OpeningHours[];
  now: LjubljanaParts;
  carParam: string | string[] | undefined;
  basePath: string;
}): DealerPageModel {
  const suspended = dealer.status === "suspended";
  const phone = dealer.phone.trim();
  return {
    suspended,
    cars: suspended ? [] : orderCars(cars, carParam),
    days: weekDays(hours),
    // HoursStrip's `today` is an index into `days`, which starts on Monday.
    today: now.isoWeekday - 1,
    nowMin: now.minutes,
    phone: phone || null,
    telHref: phone ? telHref(phone) : null,
    address: dealerAddress(dealer),
    mapsHref: mapsHref(dealer),
    privacy: privacyLink(dealer.privacyUrl, basePath),
  };
}
