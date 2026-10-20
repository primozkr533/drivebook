declare const dealerContextBrand: unique symbol;

export type DealerStatus = "active" | "suspended" | "read_only";

export type DealerContext = {
  readonly dealerId: string;
  readonly slug: string;
  readonly status: DealerStatus;
  readonly [dealerContextBrand]: true;
};

export function createDealerContext(row: { id: string; slug: string; status: DealerStatus }): DealerContext {
  return Object.freeze({ dealerId: row.id, slug: row.slug, status: row.status }) as DealerContext;
}
