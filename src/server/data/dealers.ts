import { eq } from "drizzle-orm";
import { dealers, dealerSlugHistory } from "@/db/schema";
import { isReservedSlug } from "@/lib/config";
import { getStorage } from "@/server/storage";
import { createDealerContext, type DealerContext, type DealerStatus } from "./context";
import { db } from "./db";

export type PublicDealer = {
  name: string;
  legalName: string;
  addressLine: string;
  postalCode: string;
  city: string;
  phone: string;
  email: string;
  websiteUrl: string | null;
  googleMapsUrl: string | null;
  privacyPolicyUrl: string | null;
  primaryColor: string;
  logoUrl: string | null;
  status: DealerStatus;
};

export type ResolvedDealerSlug =
  | { kind: "current"; ctx: DealerContext; dealer: PublicDealer }
  | { kind: "renamed"; slug: string }
  | { kind: "unknown" };

export async function resolveDealerSlug(slug: string): Promise<ResolvedDealerSlug> {
  const normalized = slug.toLowerCase();
  if (isReservedSlug(normalized)) return { kind: "unknown" };

  const [dealer] = await db().select().from(dealers).where(eq(dealers.slug, normalized)).limit(1);
  if (dealer) {
    return {
      kind: "current",
      ctx: createDealerContext(dealer),
      dealer: {
        name: dealer.name,
        legalName: dealer.legalName,
        addressLine: dealer.addressLine,
        postalCode: dealer.postalCode,
        city: dealer.city,
        phone: dealer.phone,
        email: dealer.email,
        websiteUrl: dealer.websiteUrl,
        googleMapsUrl: dealer.mapsUrl,
        privacyPolicyUrl: dealer.privacyUrl,
        primaryColor: dealer.primaryColor,
        logoUrl: dealer.logoKey ? getStorage().url(dealer.logoKey) : null,
        status: dealer.status,
      },
    };
  }

  const [renamed] = await db()
    .select({ slug: dealers.slug })
    .from(dealerSlugHistory)
    .innerJoin(dealers, eq(dealers.id, dealerSlugHistory.dealerId))
    .where(eq(dealerSlugHistory.slug, normalized))
    .limit(1);
  if (renamed) return { kind: "renamed", slug: renamed.slug };

  return { kind: "unknown" };
}

export async function getDealerName(ctx: DealerContext): Promise<string | null> {
  const [dealer] = await db().select({ name: dealers.name }).from(dealers).where(eq(dealers.id, ctx.dealerId)).limit(1);
  return dealer?.name ?? null;
}
