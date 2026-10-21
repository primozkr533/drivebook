import { and, asc, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import { dealerLicenceHistory, dealers, dealerSlugHistory, dealerUsers, plans } from "@/db/schema";
import { requireBackofficeRole } from "@/server/auth/permissions";
import type { DealerStatus } from "../context";
import { db } from "../db";

export type DealerListItem = {
  id: string;
  name: string;
  slug: string;
  status: DealerStatus;
  licenceValidUntil: string | null;
  planName: string;
};

export type DealerDetail = {
  id: string;
  slug: string;
  name: string;
  legalName: string;
  addressLine: string;
  postalCode: string;
  city: string;
  phone: string;
  email: string;
  websiteUrl: string | null;
  mapsUrl: string | null;
  privacyUrl: string | null;
  primaryColor: string;
  status: DealerStatus;
  notes: string | null;
  dpaSigned: boolean;
  dpaSignedAt: string | null;
  licenceValidUntil: string | null;
  createdAt: Date;
  plan: { id: string; code: string; name: string };
  slugHistory: { slug: string; replacedAt: Date }[];
  licenceHistory: {
    id: string;
    planId: string;
    planName: string;
    validFrom: Date;
    validTo: Date | null;
    previousValidUntil: string | null;
    validUntil: string;
    note: string;
    createdAt: Date;
  }[];
  owner: { id: string; email: string; status: "invited" | "active" | "deactivated" } | null;
};

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (c) => `\\${c}`);

export async function listDealers(filter: { q?: string; status?: DealerStatus } = {}): Promise<DealerListItem[]> {
  await requireBackofficeRole(["superadmin", "support"]);

  const conditions: (SQL | undefined)[] = [];
  const q = filter.q?.trim();
  if (q) {
    const pattern = `%${escapeLike(q)}%`;
    conditions.push(or(ilike(dealers.name, pattern), ilike(dealers.slug, pattern)));
  }
  if (filter.status) conditions.push(eq(dealers.status, filter.status));

  return db()
    .select({
      id: dealers.id,
      name: dealers.name,
      slug: dealers.slug,
      status: dealers.status,
      licenceValidUntil: dealers.licenceValidUntil,
      planName: plans.name,
    })
    .from(dealers)
    .innerJoin(plans, eq(plans.id, dealers.planId))
    .where(and(...conditions))
    .orderBy(asc(dealers.name), asc(dealers.id));
}

export async function getDealerDetail(id: string): Promise<DealerDetail | null> {
  await requireBackofficeRole(["superadmin", "support"]);
  // A malformed [id] route param would otherwise surface as a Postgres uuid cast error, not a 404.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;

  const [row] = await db()
    .select({ dealer: dealers, plan: { id: plans.id, code: plans.code, name: plans.name } })
    .from(dealers)
    .innerJoin(plans, eq(plans.id, dealers.planId))
    .where(eq(dealers.id, id))
    .limit(1);
  if (!row) return null;

  const [slugHistory, licenceHistory, [owner]] = await Promise.all([
    db()
      .select({ slug: dealerSlugHistory.slug, replacedAt: dealerSlugHistory.replacedAt })
      .from(dealerSlugHistory)
      .where(eq(dealerSlugHistory.dealerId, id))
      .orderBy(desc(dealerSlugHistory.replacedAt)),
    db()
      .select({
        id: dealerLicenceHistory.id,
        planId: dealerLicenceHistory.planId,
        planName: plans.name,
        validFrom: dealerLicenceHistory.validFrom,
        validTo: dealerLicenceHistory.validTo,
        previousValidUntil: dealerLicenceHistory.previousValidUntil,
        validUntil: dealerLicenceHistory.validUntil,
        note: dealerLicenceHistory.note,
        createdAt: dealerLicenceHistory.createdAt,
      })
      .from(dealerLicenceHistory)
      .innerJoin(plans, eq(plans.id, dealerLicenceHistory.planId))
      .where(eq(dealerLicenceHistory.dealerId, id))
      .orderBy(desc(dealerLicenceHistory.validFrom), desc(dealerLicenceHistory.createdAt)),
    db()
      .select({ id: dealerUsers.id, email: dealerUsers.email, status: dealerUsers.status })
      .from(dealerUsers)
      .where(and(eq(dealerUsers.dealerId, id), eq(dealerUsers.role, "owner")))
      .orderBy(asc(dealerUsers.createdAt))
      .limit(1),
  ]);

  const { dealer } = row;
  return {
    id: dealer.id,
    slug: dealer.slug,
    name: dealer.name,
    legalName: dealer.legalName,
    addressLine: dealer.addressLine,
    postalCode: dealer.postalCode,
    city: dealer.city,
    phone: dealer.phone,
    email: dealer.email,
    websiteUrl: dealer.websiteUrl,
    mapsUrl: dealer.mapsUrl,
    privacyUrl: dealer.privacyUrl,
    primaryColor: dealer.primaryColor,
    status: dealer.status,
    notes: dealer.notes,
    dpaSigned: dealer.dpaSigned,
    dpaSignedAt: dealer.dpaSignedAt,
    licenceValidUntil: dealer.licenceValidUntil,
    createdAt: dealer.createdAt,
    plan: row.plan,
    slugHistory,
    licenceHistory,
    owner: owner ?? null,
  };
}
