import { and, asc, count, eq, ne, sql } from "drizzle-orm";
import { dealerLicenceHistory, dealers, plans } from "@/db/schema";
import { newPublicId } from "@/db/ids";
import { DEFAULT_PLAN_CODE } from "@/db/seed";
import { requireBackofficeRole } from "@/server/auth/permissions";
import { db } from "../db";
import type { Tx } from "../mutate";
import { withBackofficeMutation } from "./mutate";

export const DEFAULT_MONTHLY_SMS_QUOTA = 300;
// Not part of the operator form yet; same values the seeded default plan starts from.
const NEW_PLAN_MAX_CARS = 50;
const NEW_PLAN_PRICE_EUR_CENTS = 0;

export type Plan = {
  id: string;
  code: string;
  name: string;
  monthlySmsQuota: number;
  maxUsers: number;
  notes: string | null;
  isDefault: boolean;
};
export type PlanListItem = Plan & { dealerCount: number };

export type PlanInput = { name: string; monthlySmsQuota: number; maxUsers: number; notes?: string | null };
export type PlanField = "name" | "monthlySmsQuota" | "maxUsers";
export type PlanFieldError = { ok: false; field: PlanField; error: "required" | "taken" | "invalid" };
export type PlanWriteResult = { ok: true; plan: Plan } | PlanFieldError | { ok: false; error: "notFound" };
export type PlanDeleteResult = { ok: true } | { ok: false; error: "notFound" | "inUse" | "default" };

class Refusal<E> extends Error {
  constructor(readonly result: E) {
    super("refused");
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const planColumns = {
  id: plans.id,
  code: plans.code,
  name: plans.name,
  monthlySmsQuota: plans.monthlySmsQuota,
  maxUsers: plans.maxUsers,
  notes: plans.notes,
};

const toPlan = (row: Omit<Plan, "isDefault">): Plan => ({ ...row, isDefault: row.code === DEFAULT_PLAN_CODE });

const auditValues = (p: Plan) => ({
  name: p.name,
  monthlySmsQuota: p.monthlySmsQuota,
  maxUsers: p.maxUsers,
  notes: p.notes,
});

function pgCode(err: unknown): string | undefined {
  for (let e = err; e && typeof e === "object"; e = (e as { cause?: unknown }).cause) {
    const code = (e as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  return undefined;
}

function normalize(input: PlanInput): { ok: true; values: Required<PlanInput> } | PlanFieldError {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name) return { ok: false, field: "name", error: "required" };
  if (!Number.isInteger(input.monthlySmsQuota) || input.monthlySmsQuota < 0) {
    return { ok: false, field: "monthlySmsQuota", error: "invalid" };
  }
  if (!Number.isInteger(input.maxUsers) || input.maxUsers < 1) {
    return { ok: false, field: "maxUsers", error: "invalid" };
  }
  const notes = input.notes?.trim() || null;
  return { ok: true, values: { name, monthlySmsQuota: input.monthlySmsQuota, maxUsers: input.maxUsers, notes } };
}

async function assertNameFree(tx: Tx, name: string, excludeId?: string): Promise<void> {
  const [clash] = await tx
    .select({ id: plans.id })
    .from(plans)
    .where(and(sql`lower(${plans.name}) = lower(${name})`, excludeId ? ne(plans.id, excludeId) : undefined))
    .limit(1);
  if (clash) throw new Refusal<PlanFieldError>({ ok: false, field: "name", error: "taken" });
}

async function newPlanCode(tx: Tx, name: string): Promise<string> {
  const base = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const code = base || "plan";
  const [clash] = await tx.select({ id: plans.id }).from(plans).where(eq(plans.code, code)).limit(1);
  return clash ? `${code}-${newPublicId().slice(0, 6).toLowerCase()}` : code;
}

async function refusable<R>(run: () => Promise<R>): Promise<R> {
  try {
    return await run();
  } catch (err) {
    if (err instanceof Refusal) return err.result as R;
    // Races past the in-transaction checks still hit the unique / foreign-key constraints.
    if (pgCode(err) === "23505") return { ok: false, field: "name", error: "taken" } as R;
    if (pgCode(err) === "23503") return { ok: false, error: "inUse" } as R;
    throw err;
  }
}

export async function listPlans(): Promise<PlanListItem[]> {
  await requireBackofficeRole(["superadmin", "support"]);
  const rows = await db()
    .select({ ...planColumns, dealerCount: count(dealers.id) })
    .from(plans)
    .leftJoin(dealers, eq(dealers.planId, plans.id))
    .groupBy(plans.id)
    .orderBy(asc(plans.name), asc(plans.id));
  return rows.map(({ dealerCount, ...row }) => ({ ...toPlan(row), dealerCount }));
}

export async function getPlan(id: string): Promise<Plan | null> {
  await requireBackofficeRole(["superadmin", "support"]);
  if (!UUID.test(id)) return null;
  const [row] = await db().select(planColumns).from(plans).where(eq(plans.id, id)).limit(1);
  return row ? toPlan(row) : null;
}

export async function createPlan(
  input: Omit<PlanInput, "monthlySmsQuota"> & { monthlySmsQuota?: number },
): Promise<PlanWriteResult> {
  await requireBackofficeRole(["superadmin"]);
  const parsed = normalize({ ...input, monthlySmsQuota: input.monthlySmsQuota ?? DEFAULT_MONTHLY_SMS_QUOTA });
  if (!parsed.ok) return parsed;
  const { values } = parsed;

  return refusable(() =>
    withBackofficeMutation(
      async (tx): Promise<PlanWriteResult> => {
        await assertNameFree(tx, values.name);
        const [row] = await tx
          .insert(plans)
          .values({
            ...values,
            code: await newPlanCode(tx, values.name),
            maxCars: NEW_PLAN_MAX_CARS,
            priceEurCents: NEW_PLAN_PRICE_EUR_CENTS,
          })
          .returning(planColumns);
        return { ok: true, plan: toPlan(row) };
      },
      (r) => {
        const plan = (r as { plan: Plan }).plan;
        return { action: "plan.create", entity: "plan", entityId: plan.id, details: { after: auditValues(plan) } };
      },
    ),
  );
}

export async function updatePlan(id: string, input: PlanInput): Promise<PlanWriteResult> {
  await requireBackofficeRole(["superadmin"]);
  const parsed = normalize(input);
  if (!parsed.ok) return parsed;
  if (!UUID.test(id)) return { ok: false, error: "notFound" };
  const { values } = parsed;

  let before: Plan | undefined;
  return refusable(() =>
    withBackofficeMutation(
      async (tx): Promise<PlanWriteResult> => {
        const [current] = await tx.select(planColumns).from(plans).where(eq(plans.id, id)).for("update");
        if (!current) throw new Refusal({ ok: false, error: "notFound" });
        before = toPlan(current);
        await assertNameFree(tx, values.name, id);
        const [row] = await tx.update(plans).set(values).where(eq(plans.id, id)).returning(planColumns);
        return { ok: true, plan: toPlan(row) };
      },
      (r) => {
        const prev = auditValues(before!);
        const next = auditValues((r as { plan: Plan }).plan);
        const changed = (Object.keys(next) as (keyof typeof next)[]).filter((k) => prev[k] !== next[k]);
        return {
          action: "plan.update",
          entity: "plan",
          entityId: id,
          details: {
            before: Object.fromEntries(changed.map((k) => [k, prev[k]])),
            after: Object.fromEntries(changed.map((k) => [k, next[k]])),
          },
        };
      },
    ),
  );
}

export async function deletePlan(id: string): Promise<PlanDeleteResult> {
  await requireBackofficeRole(["superadmin"]);
  if (!UUID.test(id)) return { ok: false, error: "notFound" };

  let before: Plan | undefined;
  return refusable(() =>
    withBackofficeMutation(
      async (tx): Promise<PlanDeleteResult> => {
        const [current] = await tx.select(planColumns).from(plans).where(eq(plans.id, id)).for("update");
        if (!current) throw new Refusal({ ok: false, error: "notFound" });
        before = toPlan(current);
        if (before.isDefault) throw new Refusal({ ok: false, error: "default" });
        // Licence history rows keep pointing at the plan a dealer was on, so they count as use too.
        const [[onDealers], [inHistory]] = await Promise.all([
          tx.select({ n: count() }).from(dealers).where(eq(dealers.planId, id)),
          tx.select({ n: count() }).from(dealerLicenceHistory).where(eq(dealerLicenceHistory.planId, id)),
        ]);
        if (onDealers.n > 0 || inHistory.n > 0) throw new Refusal({ ok: false, error: "inUse" });
        await tx.delete(plans).where(eq(plans.id, id));
        return { ok: true };
      },
      () => ({ action: "plan.delete", entity: "plan", entityId: id, details: { before: auditValues(before!) } }),
    ),
  );
}
