import { and, asc, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import {
  bookingRules,
  dealerLicenceHistory,
  dealers,
  dealerSlugHistory,
  dealerUsers,
  holidayOverrides,
  plans,
} from "@/db/schema";
import { ljubljanaNow, slovenianWorkFreeDays } from "@/lib/date";
import { createInvitation } from "@/server/auth/links";
import { requireBackofficeRole } from "@/server/auth/permissions";
import { normalizeEmail } from "@/server/auth/rate-limit";
import type { DealerStatus } from "../context";
import { db } from "../db";
import { withBackofficeMutation } from "./mutate";
import { validateSlug, type SlugError } from "./slug";

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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  if (!UUID_RE.test(id)) return null;

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

export type CreateDealerInput = {
  name: string;
  slug: string;
  ownerEmail: string;
  planId: string;
  licenceValidUntil: string;
  notes?: string;
};

export type CreateDealerError =
  | { ok: false; field: "name"; error: "required" }
  | { ok: false; field: "slug"; error: SlugError }
  | { ok: false; field: "ownerEmail"; error: "format" | "taken" }
  | { ok: false; field: "planId"; error: "unknown" }
  | { ok: false; field: "licenceValidUntil"; error: "format" | "past" };

export type CreateDealerResult = { ok: true; id: string; slug: string } | CreateDealerError;

// Profile fields are filled in later by the dealer; the brand colour needs some valid hex until then.
const DEFAULT_PRIMARY_COLOR = "#1F4FD8";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

class CreateDealerRejected extends Error {
  constructor(readonly result: CreateDealerError) {
    super(`createDealer rejected: ${result.field}`);
  }
}

function isRealDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export async function createDealer(input: CreateDealerInput, opts: { now?: Date } = {}): Promise<CreateDealerResult> {
  const now = opts.now ?? new Date();
  const today = ljubljanaNow(now).dateISO;
  const name = input.name.trim();
  const slug = input.slug.trim();
  const ownerEmail = normalizeEmail(input.ownerEmail);
  const notes = input.notes?.trim() || null;

  let created: { id: string; ownerId: string };
  try {
    created = await withBackofficeMutation(
      async (tx, actor) => {
        const reject = (result: CreateDealerError): never => {
          throw new CreateDealerRejected(result);
        };
        if (!name) reject({ ok: false, field: "name", error: "required" });
        const slugCheck = await validateSlug(slug);
        if (!slugCheck.ok) reject({ ok: false, field: "slug", error: slugCheck.error });
        if (!EMAIL_RE.test(ownerEmail)) reject({ ok: false, field: "ownerEmail", error: "format" });
        const [emailUsed] = await tx
          .select({ id: dealerUsers.id })
          .from(dealerUsers)
          .where(eq(dealerUsers.email, ownerEmail))
          .limit(1);
        if (emailUsed) reject({ ok: false, field: "ownerEmail", error: "taken" });
        const [plan] = UUID_RE.test(input.planId)
          ? await tx.select({ id: plans.id }).from(plans).where(eq(plans.id, input.planId)).limit(1)
          : [];
        if (!plan) reject({ ok: false, field: "planId", error: "unknown" });
        if (!isRealDate(input.licenceValidUntil)) reject({ ok: false, field: "licenceValidUntil", error: "format" });
        if (input.licenceValidUntil < today) reject({ ok: false, field: "licenceValidUntil", error: "past" });

        const [dealer] = await tx
          .insert(dealers)
          .values({
            slug,
            name,
            legalName: name,
            addressLine: "",
            postalCode: "",
            city: "",
            phone: "",
            email: ownerEmail,
            primaryColor: DEFAULT_PRIMARY_COLOR,
            planId: input.planId,
            status: "active",
            notes,
            licenceValidUntil: input.licenceValidUntil,
          })
          .returning({ id: dealers.id });

        await tx.insert(dealerLicenceHistory).values({
          dealerId: dealer.id,
          planId: input.planId,
          validFrom: now,
          previousValidUntil: null,
          validUntil: input.licenceValidUntil,
          note: "initial",
          createdByBackofficeUserId: actor.userId,
        });

        await tx.insert(bookingRules).values({ dealerId: dealer.id });

        const year = Number(today.slice(0, 4));
        await tx.insert(holidayOverrides).values(
          [...slovenianWorkFreeDays(year), ...slovenianWorkFreeDays(year + 1)].map((day) => ({
            dealerId: dealer.id,
            date: day.date,
            key: day.key,
            name: day.name,
            isOpen: false,
          })),
        );

        const [owner] = await tx
          .insert(dealerUsers)
          .values({
            dealerId: dealer.id,
            email: ownerEmail,
            name: ownerEmail.split("@")[0],
            role: "owner",
            status: "invited",
          })
          .returning({ id: dealerUsers.id });

        return { id: dealer.id, ownerId: owner.id };
      },
      (result) => ({
        action: "dealer.create",
        entity: "dealer",
        entityId: result.id,
        dealerId: result.id,
        details: { after: { name, slug, ownerEmail, planId: input.planId, licenceValidUntil: input.licenceValidUntil, notes } },
      }),
    );
  } catch (error) {
    if (error instanceof CreateDealerRejected) return error.result;
    throw error;
  }

  // Only after the commit, so a rolled-back creation can never leave an invitation e-mail behind.
  await createInvitation("dealer", created.ownerId, { now });
  return { ok: true, id: created.id, slug };
}
