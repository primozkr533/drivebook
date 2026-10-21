"use server";

import { redirect } from "next/navigation";
import { ForbiddenError, getSurfaceBasePath, requireBackofficeUser } from "@/server/auth/permissions";
import { savedQuery } from "../saved";
import { createPlan, deletePlan, updatePlan, type PlanField } from "@/server/data/backoffice/plans";

export type PlanFormState = {
  values?: { name: string; monthlySmsQuota: string; maxUsers: string; notes: string };
  field?: PlanField;
  error?: "required" | "invalid" | "taken" | "notFound" | "forbidden";
};

export type DeletePlanState = { error?: "inUse" | "default" | "notFound" | "forbidden" };

const text = (form: FormData, name: string) => {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
};

// Number("") is 0, so blank or non-digit input must become NaN for the service to reject it.
const integer = (value: string) => (/^\d+$/.test(value.trim()) ? Number(value.trim()) : Number.NaN);

async function refuseForbidden<S>(run: () => Promise<S>, forbidden: S): Promise<S> {
  try {
    return await run();
  } catch (err) {
    if (err instanceof ForbiddenError) return forbidden;
    throw err;
  }
}

async function plansPath(change: string) {
  return `${await getSurfaceBasePath()}/plans?${savedQuery(change)}`;
}

export async function savePlanAction(id: string | null, _prev: PlanFormState, form: FormData): Promise<PlanFormState> {
  await requireBackofficeUser();
  const values = {
    name: text(form, "name"),
    monthlySmsQuota: text(form, "monthlySmsQuota"),
    maxUsers: text(form, "maxUsers"),
    notes: text(form, "notes"),
  };
  const input = {
    name: values.name,
    monthlySmsQuota: integer(values.monthlySmsQuota),
    maxUsers: integer(values.maxUsers),
    notes: values.notes,
  };
  const result = await refuseForbidden<PlanFormState | null>(async () => {
    const r = id === null ? await createPlan(input) : await updatePlan(id, input);
    if (r.ok) return null;
    return "field" in r ? { values, field: r.field, error: r.error } : { values, error: r.error };
  }, { values, error: "forbidden" });
  if (result) return result;
  redirect(await plansPath(id === null ? "create" : "update"));
}

export async function deletePlanAction(id: string, _prev: DeletePlanState, _form: FormData): Promise<DeletePlanState> {
  await requireBackofficeUser();
  const result = await refuseForbidden<DeletePlanState | null>(async () => {
    const r = await deletePlan(id);
    return r.ok ? null : { error: r.error };
  }, { error: "forbidden" });
  if (result) return result;
  redirect(await plansPath("delete"));
}
