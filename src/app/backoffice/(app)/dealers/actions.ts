"use server";

import { redirect } from "next/navigation";
import { ForbiddenError, getSurfaceBasePath, requireBackofficeUser } from "@/server/auth/permissions";
import { createDealer, type CreateDealerError } from "@/server/data/backoffice/dealers";

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
