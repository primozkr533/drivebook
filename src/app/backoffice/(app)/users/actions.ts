"use server";

import { redirect } from "next/navigation";
import { ForbiddenError, getSurfaceBasePath, requireBackofficeUser } from "@/server/auth/permissions";
import { deactivateBackofficeUser, inviteBackofficeUser } from "@/server/data/backoffice/users";

const roles = ["support", "superadmin"] as const;
type InviteRole = (typeof roles)[number];

export type InviteUserState = {
  values?: { email: string; role: string };
  error?: "email" | "role" | "taken" | "forbidden";
};

export type DeactivateUserState = { error?: "self" | "notFound" | "forbidden" };

const text = (form: FormData, name: string) => {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
};

async function refuseForbidden<S>(run: () => Promise<S>, forbidden: S): Promise<S> {
  try {
    return await run();
  } catch (err) {
    if (err instanceof ForbiddenError) return forbidden;
    throw err;
  }
}

async function usersPath() {
  return `${await getSurfaceBasePath()}/users`;
}

export async function inviteUserAction(_prev: InviteUserState, form: FormData): Promise<InviteUserState> {
  await requireBackofficeUser();
  const values = { email: text(form, "email"), role: text(form, "role") };
  const role = roles.find((r): r is InviteRole => r === values.role);
  if (!role) return { values, error: "role" };
  const result = await refuseForbidden<InviteUserState | null>(async () => {
    const r = await inviteBackofficeUser({ email: values.email, role });
    return r.ok ? null : { values, error: r.error };
  }, { values, error: "forbidden" });
  if (result) return result;
  redirect(await usersPath());
}

export async function deactivateUserAction(
  userId: string,
  _prev: DeactivateUserState,
  _form: FormData,
): Promise<DeactivateUserState> {
  await requireBackofficeUser();
  const result = await refuseForbidden<DeactivateUserState | null>(async () => {
    const r = await deactivateBackofficeUser(userId);
    if (r.ok) return null;
    return { error: r.error === "self" ? "self" : "notFound" };
  }, { error: "forbidden" });
  if (result) return result;
  redirect(await usersPath());
}
