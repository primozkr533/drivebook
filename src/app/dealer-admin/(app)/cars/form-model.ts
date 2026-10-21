import type { CarStatusFilter } from "@/server/data/cars";

export const CAR_STATUS_FILTERS = ["active", "inactive", "all"] as const satisfies readonly CarStatusFilter[];

export function parseCarStatusFilter(raw: string | string[] | undefined): CarStatusFilter {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return CAR_STATUS_FILTERS.find((s) => s === value) ?? "active";
}

export type CarDraft = { make: string; model: string; year: string; price: string; imageUrl: string };
export type AutofillFields = { make?: string; model?: string; year?: number; price?: number; imageUrl?: string };

const DRAFT_KEYS = ["make", "model", "year", "price", "imageUrl"] as const;

// `hasImage`: a stored or freshly picked image counts as a filled image field.
export function mergeAutofill(
  draft: CarDraft,
  fields: AutofillFields,
  { hasImage = false }: { hasImage?: boolean } = {},
): { draft: CarDraft; filled: (keyof CarDraft)[] } {
  const next = { ...draft };
  const filled: (keyof CarDraft)[] = [];
  for (const key of DRAFT_KEYS) {
    const value = fields[key];
    if (value === undefined || value === null || String(value).trim() === "") continue;
    if (draft[key].trim() !== "" || (key === "imageUrl" && hasImage)) continue;
    next[key] = String(value).trim();
    filled.push(key);
  }
  return { draft: next, filled };
}
