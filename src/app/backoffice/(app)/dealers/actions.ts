"use server";

import { redirect } from "next/navigation";
import { ForbiddenError, getSurfaceBasePath, requireBackofficeUser } from "@/server/auth/permissions";
import { savedQuery } from "../saved";
import {
  changeDealerSlug,
  createDealer,
  extendLicence,
  recordDpaSigned,
  resendOwnerInvitation,
  setDealerStatus,
  updateDealer,
  type CreateDealerError,
} from "@/server/data/backoffice/dealers";

export type CreateDealerValues = {
  name: string;
  slug: string;
  ownerEmail: string;
  planId: string;
  licenceValidUntil: string;
  notes: string;
};

export type CreateDealerFormState = {
  values?: CreateDealerValues;
  field?: CreateDealerError["field"];
  error?: CreateDealerError["error"] | "forbidden";
};

const text = (form: FormData, name: string) => {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
};

export async function createDealerAction(_prev: CreateDealerFormState, form: FormData): Promise<CreateDealerFormState> {
  await requireBackofficeUser();
  const values: CreateDealerValues = {
    name: text(form, "name"),
    slug: text(form, "slug"),
    ownerEmail: text(form, "ownerEmail"),
    planId: text(form, "planId"),
    licenceValidUntil: text(form, "licenceValidUntil"),
    notes: text(form, "notes"),
  };
  let result;
  try {
    result = await createDealer(values);
  } catch (err) {
    if (err instanceof ForbiddenError) return { values, error: "forbidden" };
    throw err;
  }
  if (!result.ok) return { values, field: result.field, error: result.error };
  redirect(`${await getSurfaceBasePath()}/dealers/${result.id}?invited=1`);
}

export type DealerChange = "profile" | "slug" | "status" | "licence" | "dpa" | "invite";

export type DealerFormState<V extends Record<string, string> = Record<string, string>> = {
  values?: V;
  field?: string;
  error?: string;
};

async function runDealerChange<V extends Record<string, string>>(
  id: string,
  change: DealerChange,
  values: V,
  run: () => Promise<{ ok: true } | { ok: false; field?: string; error: string }>,
): Promise<DealerFormState<V>> {
  await requireBackofficeUser();
  let result;
  try {
    result = await run();
  } catch (err) {
    if (err instanceof ForbiddenError) return { values, error: "forbidden" };
    throw err;
  }
  if (!result.ok) return { values, field: result.field, error: result.error };
  redirect(`${await getSurfaceBasePath()}/dealers/${id}?${savedQuery(change)}`);
}

export async function updateDealerAction(id: string, _prev: DealerFormState, form: FormData) {
  const values = { name: text(form, "name"), planId: text(form, "planId"), notes: text(form, "notes") };
  return runDealerChange(id, "profile", values, () => updateDealer(id, values));
}

export async function changeDealerSlugAction(id: string, _prev: DealerFormState, form: FormData) {
  const values = { slug: text(form, "slug") };
  return runDealerChange(id, "slug", values, () => changeDealerSlug(id, values.slug));
}

export async function setDealerStatusAction(id: string, _prev: DealerFormState, form: FormData) {
  const values = { status: text(form, "status") };
  const status = values.status === "suspended" || values.status === "active" ? values.status : null;
  if (!status) return { values, field: "status", error: "invalid" };
  return runDealerChange(id, "status", values, () => setDealerStatus(id, status));
}

export async function extendLicenceAction(id: string, _prev: DealerFormState, form: FormData) {
  const values = { validUntil: text(form, "validUntil"), note: text(form, "note") };
  return runDealerChange(id, "licence", values, () => extendLicence(id, values));
}

export async function recordDpaSignedAction(id: string, _prev: DealerFormState, form: FormData) {
  const values = { signedAt: text(form, "signedAt") };
  return runDealerChange(id, "dpa", values, () => recordDpaSigned(id, values));
}

export async function resendOwnerInvitationAction(id: string, _prev: DealerFormState, _form: FormData) {
  return runDealerChange(id, "invite", {}, () => resendOwnerInvitation(id));
}
