export const SAVED_CHANGES = ["invite", "role", "deactivate", "reactivate"] as const;
export type SavedChange = (typeof SAVED_CHANGES)[number];

type Query = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";

// The nonce makes two saves of the same kind still land on a new URL, so the form key changes.
export function savedQuery(change: SavedChange): string {
  return `saved=${change}&t=${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function savedChange(query: Query = {}): SavedChange | undefined {
  return SAVED_CHANGES.find((c) => c === first(query.saved));
}

// useActionState keeps a failed attempt's error across the success redirect's soft navigation; a new key remounts the form.
export function savedFormKey(query: Query = {}): string {
  return `${first(query.saved) || "none"}:${first(query.t)}`;
}
