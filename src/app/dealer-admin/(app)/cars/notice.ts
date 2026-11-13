import type { CarStatusFilter } from "@/server/data/cars";

// `?status=` is taken by the list filter, so refused list actions and saves report back via `?notice=`.
export const CAR_LIST_NOTICES = ["readOnly", "forbidden", "limit", "imageNotFetched"] as const;
export type CarListNotice = (typeof CAR_LIST_NOTICES)[number];

export function parseCarListNotice(raw: string | string[] | undefined): CarListNotice | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return CAR_LIST_NOTICES.find((n) => n === value);
}

export const isCarListWarning = (notice: CarListNotice): notice is "imageNotFetched" => notice === "imageNotFetched";

export function carsListHref(listHref: string, status: CarStatusFilter, notice?: CarListNotice): string {
  return `${listHref}?status=${status}${notice ? `&notice=${notice}` : ""}`;
}
