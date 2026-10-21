"use server";

import { notFound, redirect } from "next/navigation";
import {
  DealerReadOnlyError,
  ForbiddenError,
  getSurfaceBasePath,
  requireDealerUser,
  type DealerRole,
} from "@/server/auth/permissions";
import {
  changeDealerUserRole,
  deactivateDealerUser,
  inviteDealerUser,
  reactivateDealerUser,
} from "@/server/data/dealer-users";
import { savedQuery, type SavedChange } from "./saved";

const roles: readonly DealerRole[] = ["owner", "salesperson"];

type CommonError = "forbidden" | "readOnly";

export type InviteDealerUserState = {
  values?: { email: string; name: string; role: string };
  error?: "email" | "name" | "role" | "taken" | "limit_reached" | CommonError;
};

export type UserActionState = {
  error?: "role" | "last_owner" | "limit_reached" | "not_deactivated" | CommonError;
};

const text = (form: FormData, name: string) => {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
};

const parseRole = (value: string) => roles.find((r) => r === value);

async function refuse<S>(run: () => Promise<S>, values?: InviteDealerUserState["values"]): Promise<S | { error: CommonError }> {
  try {
    return await run();
  } catch (err) {
    if (err instanceof ForbiddenError) return { error: "forbidden" };
    if (err instanceof DealerReadOnlyError) return { ...(values && { values }), error: "readOnly" };
    throw err;
  }
}

async function savedRedirect(change: SavedChange): Promise<never> {
  redirect(`${await getSurfaceBasePath()}/users?${savedQuery(change)}`);
}

export async function inviteDealerUserAction(
  _prev: InviteDealerUserState,
  form: FormData,
): Promise<InviteDealerUserState> {
  const { ctx } = await requireDealerUser();
  const values = { email: text(form, "email"), name: text(form, "name"), role: text(form, "role") };
  const role = parseRole(values.role);
  if (!role) return { values, error: "role" };
  const result = await refuse(async () => {
    const r = await inviteDealerUser(ctx, { email: values.email, name: values.name, role });
    return r.ok ? null : { values, error: r.error };
  }, values);
  if (result) return result;
  return savedRedirect("invite");
}

export async function changeDealerUserRoleAction(_prev: UserActionState, form: FormData): Promise<UserActionState> {
  const { ctx } = await requireDealerUser();
  const role = parseRole(text(form, "role"));
  if (!role) return { error: "role" };
  const result = await refuse(async () => {
    const r = await changeDealerUserRole(ctx, text(form, "userId"), role);
    if (r.ok) return null;
    if (r.error === "not_found") notFound();
    return { error: r.error };
  });
  if (result) return result;
  return savedRedirect("role");
}

export async function deactivateDealerUserAction(_prev: UserActionState, form: FormData): Promise<UserActionState> {
  const { ctx } = await requireDealerUser();
  const result = await refuse(async () => {
    const r = await deactivateDealerUser(ctx, text(form, "userId"));
    if (r.ok) return null;
    if (r.error === "not_found") notFound();
    return { error: r.error };
  });
  if (result) return result;
  return savedRedirect("deactivate");
}

export async function reactivateDealerUserAction(_prev: UserActionState, form: FormData): Promise<UserActionState> {
  const { ctx } = await requireDealerUser();
  const result = await refuse(async () => {
    const r = await reactivateDealerUser(ctx, text(form, "userId"));
    if (r.ok) return null;
    if (r.error === "not_found") notFound();
    return { error: r.error };
  });
  if (result) return result;
  return savedRedirect("reactivate");
}
