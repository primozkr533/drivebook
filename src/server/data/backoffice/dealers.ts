import { and, asc, desc, eq, ilike, isNull, or, type SQL } from "drizzle-orm";
import { createTranslator } from "next-intl";
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
import { createInvitation, linkCapReached, resendInvitation } from "@/server/auth/links";
import { requireBackofficeRole, type BackofficeActor } from "@/server/auth/permissions";
import { normalizeEmail } from "@/server/auth/rate-limit";
import type { DealerStatus } from "../context";
import { db } from "../db";
import type { Tx } from "../mutate";
import { withBackofficeMutation, type BackofficeAuditEntry } from "./mutate";
import { validateSlug, type SlugError } from "./slug";
import holidays from "../../../../messages/sl/holidays.json";

const holidayT = createTranslator({ locale: "sl", messages: { holidays }, namespace: "holidays" });

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
            name: holidayT(day.key as keyof typeof holidays),
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
    // A concurrent creation can take the slug or e-mail between validation and insert.
    if (isUniqueViolation(error)) {
      const constraint = uniqueConstraint(error);
      if (constraint === "dealers_slug_unique") return { ok: false, field: "slug", error: "taken" };
      if (constraint === "dealer_users_email_unique") return { ok: false, field: "ownerEmail", error: "taken" };
    }
    throw error;
  }

  // Only after the commit, so a rolled-back creation can never leave an invitation e-mail behind.
  await createInvitation("dealer", created.ownerId, { now });
  return { ok: true, id: created.id, slug };
}

type ActionError = { ok: false; field?: string; error: string };
export type DealerActionResult<E extends ActionError> = { ok: true } | E;

class ActionRejected extends Error {
  constructor(readonly result: ActionError) {
    super(`dealer action rejected: ${result.error}`);
  }
}

// Rejections are thrown inside the mutation so the audit row rolls back with them.
async function mutateDealer<E extends ActionError, T>(
  id: string,
  fn: (tx: Tx, dealer: typeof dealers.$inferSelect, actor: BackofficeActor, reject: (e: E) => never) => Promise<T>,
  audit: (result: T) => BackofficeAuditEntry,
): Promise<{ ok: true; value: T } | E | { ok: false; error: "notFound" }> {
  try {
    const value = await withBackofficeMutation(
      async (tx, actor) => {
        const [dealer] = UUID_RE.test(id)
          ? await tx.select().from(dealers).where(eq(dealers.id, id)).limit(1).for("update")
          : [];
        if (!dealer) throw new ActionRejected({ ok: false, error: "notFound" });
        return fn(tx, dealer, actor, (e) => {
          throw new ActionRejected(e);
        });
      },
      audit,
    );
    return { ok: true, value };
  } catch (error) {
    if (error instanceof ActionRejected) return error.result as E | { ok: false; error: "notFound" };
    if (isUniqueViolation(error)) return { ok: false, field: "slug", error: "taken" } as E;
    throw error;
  }
}

const isUniqueViolation = (error: unknown): boolean =>
  error instanceof Error &&
  ((error as { code?: string }).code === "23505" || (error.cause as { code?: string } | undefined)?.code === "23505");

const uniqueConstraint = (error: unknown): string | undefined =>
  error instanceof Error
    ? ((error as { constraint?: string }).constraint ?? (error.cause as { constraint?: string } | undefined)?.constraint)
    : undefined;

const done = <R extends { ok: boolean }>(result: R) => (result.ok ? { ok: true as const } : result);

export type UpdateDealerResult = DealerActionResult<
  | { ok: false; error: "notFound" }
  | { ok: false; field: "name"; error: "required" }
  | { ok: false; field: "planId"; error: "unknown" }
>;

export async function updateDealer(
  id: string,
  input: { name: string; planId: string; notes?: string | null },
): Promise<UpdateDealerResult> {
  const name = input.name.trim();
  const notes = input.notes?.trim() || null;
  const result = await mutateDealer<Exclude<UpdateDealerResult, { ok: true }>, { before: object; after: object }>(
    id,
    async (tx, dealer, _actor, reject) => {
      if (!name) reject({ ok: false, field: "name", error: "required" });
      const [plan] = UUID_RE.test(input.planId)
        ? await tx.select({ id: plans.id }).from(plans).where(eq(plans.id, input.planId)).limit(1)
        : [];
      if (!plan) reject({ ok: false, field: "planId", error: "unknown" });
      await tx.update(dealers).set({ name, planId: input.planId, notes, updatedAt: new Date() }).where(eq(dealers.id, id));
      return {
        before: { name: dealer.name, planId: dealer.planId, notes: dealer.notes },
        after: { name, planId: input.planId, notes },
      };
    },
    (changes) => ({ action: "dealer.update", entity: "dealer", entityId: id, dealerId: id, details: changes }),
  );
  return done(result);
}

export type ChangeDealerSlugResult = DealerActionResult<
  { ok: false; error: "notFound" } | { ok: false; field: "slug"; error: SlugError }
>;

export async function changeDealerSlug(id: string, newSlug: string): Promise<ChangeDealerSlugResult> {
  const slug = newSlug.trim();
  const result = await mutateDealer<Exclude<ChangeDealerSlugResult, { ok: true }>, string>(
    id,
    async (tx, dealer, _actor, reject) => {
      const check = await validateSlug(slug, { excludeDealerId: id });
      if (!check.ok) reject({ ok: false, field: "slug", error: check.error });
      if (slug === dealer.slug) return dealer.slug;
      // Taking back one of its own old slugs must not leave that slug redirecting to itself.
      await tx
        .delete(dealerSlugHistory)
        .where(and(eq(dealerSlugHistory.dealerId, id), eq(dealerSlugHistory.slug, slug)));
      await tx.insert(dealerSlugHistory).values({ dealerId: id, slug: dealer.slug });
      await tx.update(dealers).set({ slug, updatedAt: new Date() }).where(eq(dealers.id, id));
      return dealer.slug;
    },
    (oldSlug) => ({
      action: "dealer.slug_change",
      entity: "dealer",
      entityId: id,
      dealerId: id,
      details: { before: { slug: oldSlug }, after: { slug } },
    }),
  );
  return done(result);
}

export type SetDealerStatusResult = DealerActionResult<{ ok: false; error: "notFound" }>;

export async function setDealerStatus(id: string, status: "suspended" | "active"): Promise<SetDealerStatusResult> {
  if (status !== "suspended" && status !== "active") throw new Error(`Unsupported dealer status: ${String(status)}`);
  const result = await mutateDealer<{ ok: false; error: "notFound" }, DealerStatus>(
    id,
    async (tx, dealer) => {
      await tx.update(dealers).set({ status, updatedAt: new Date() }).where(eq(dealers.id, id));
      return dealer.status;
    },
    (previous) => ({
      action: status === "suspended" ? "dealer.suspend" : "dealer.reactivate",
      entity: "dealer",
      entityId: id,
      dealerId: id,
      details: { before: { status: previous }, after: { status } },
    }),
  );
  return done(result);
}

export type ExtendLicenceResult = DealerActionResult<
  | { ok: false; error: "notFound" }
  | { ok: false; field: "validUntil"; error: "format" | "past" | "beforeCurrent" }
  | { ok: false; field: "note"; error: "required" }
>;

export async function extendLicence(
  id: string,
  input: { validUntil: string; note: string },
  opts: { now?: Date } = {},
): Promise<ExtendLicenceResult> {
  const now = opts.now ?? new Date();
  const validUntil = input.validUntil.trim();
  const note = input.note.trim();
  const result = await mutateDealer<Exclude<ExtendLicenceResult, { ok: true }>, string | null>(
    id,
    async (tx, dealer, actor, reject) => {
      if (!isRealDate(validUntil)) reject({ ok: false, field: "validUntil", error: "format" });
      if (validUntil < ljubljanaNow(now).dateISO) reject({ ok: false, field: "validUntil", error: "past" });
      if (dealer.licenceValidUntil && validUntil < dealer.licenceValidUntil) {
        reject({ ok: false, field: "validUntil", error: "beforeCurrent" });
      }
      if (!note) reject({ ok: false, field: "note", error: "required" });
      // History periods may not overlap, so the open period ends where the new one starts.
      await tx
        .update(dealerLicenceHistory)
        .set({ validTo: now, updatedAt: now })
        .where(and(eq(dealerLicenceHistory.dealerId, id), isNull(dealerLicenceHistory.validTo)));
      await tx.insert(dealerLicenceHistory).values({
        dealerId: id,
        planId: dealer.planId,
        validFrom: now,
        previousValidUntil: dealer.licenceValidUntil,
        validUntil,
        note,
        createdByBackofficeUserId: actor.userId,
      });
      await tx.update(dealers).set({ licenceValidUntil: validUntil, updatedAt: now }).where(eq(dealers.id, id));
      return dealer.licenceValidUntil;
    },
    (previous) => ({
      action: "dealer.licence_extend",
      entity: "dealer",
      entityId: id,
      dealerId: id,
      details: { before: { licenceValidUntil: previous }, after: { licenceValidUntil: validUntil }, note },
    }),
  );
  return done(result);
}

export type RecordDpaSignedResult = DealerActionResult<
  { ok: false; error: "notFound" } | { ok: false; field: "signedAt"; error: "format" }
>;

export async function recordDpaSigned(id: string, input: { signedAt: string }): Promise<RecordDpaSignedResult> {
  const signedAt = input.signedAt.trim();
  const result = await mutateDealer<Exclude<RecordDpaSignedResult, { ok: true }>, { dpaSigned: boolean; dpaSignedAt: string | null }>(
    id,
    async (tx, dealer, _actor, reject) => {
      if (!isRealDate(signedAt)) reject({ ok: false, field: "signedAt", error: "format" });
      await tx.update(dealers).set({ dpaSigned: true, dpaSignedAt: signedAt, updatedAt: new Date() }).where(eq(dealers.id, id));
      return { dpaSigned: dealer.dpaSigned, dpaSignedAt: dealer.dpaSignedAt };
    },
    (before) => ({
      action: "dealer.dpa_signed",
      entity: "dealer",
      entityId: id,
      dealerId: id,
      details: { before, after: { dpaSigned: true, dpaSignedAt: signedAt } },
    }),
  );
  return done(result);
}

export type ResendOwnerInvitationResult = DealerActionResult<
  { ok: false; error: "notFound" } | { ok: false; error: "notInvited" } | { ok: false; error: "rateLimited" }
>;

export async function resendOwnerInvitation(id: string, opts: { now?: Date } = {}): Promise<ResendOwnerInvitationResult> {
  const now = opts.now ?? new Date();
  const result = await mutateDealer<Exclude<ResendOwnerInvitationResult, { ok: true }>, { id: string; email: string }>(
    id,
    async (tx, _dealer, _actor, reject) => {
      const [owner] = await tx
        .select({ id: dealerUsers.id, email: dealerUsers.email, status: dealerUsers.status })
        .from(dealerUsers)
        .where(and(eq(dealerUsers.dealerId, id), eq(dealerUsers.role, "owner")))
        .orderBy(asc(dealerUsers.createdAt))
        .limit(1);
      if (!owner || owner.status !== "invited") reject({ ok: false, error: "notInvited" });
      if (await linkCapReached("dealer", owner.id, "invite", now, tx)) reject({ ok: false, error: "rateLimited" });
      return { id: owner.id, email: owner.email };
    },
    (owner) => ({
      action: "dealer.invite_resend",
      entity: "dealer",
      entityId: id,
      dealerId: id,
      details: { ownerId: owner.id, email: owner.email },
    }),
  );
  if (!result.ok) return result;

  // Only after the commit, so a rolled-back request never leaves an invitation e-mail behind.
  const sent = await resendInvitation("dealer", result.value.id, { now });
  return sent.ok ? { ok: true } : { ok: false, error: "notInvited" };
}
