"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { consumeLinkToken, requestPasswordReset, type LinkPurpose } from "@/server/auth/links";
import { validateNewPassword } from "@/server/auth/password";
import { getSurfaceBasePath } from "@/server/auth/permissions";
import { setSessionCookie, type AuthSurface } from "@/server/auth/session";

export type SetPasswordState = {
  error?: "too_short" | "mismatch";
  status?: "expired" | "used" | "invalid";
};

export type ForgotPasswordState = { sent: boolean; error?: "email_required" };

const field = (form: FormData, name: string) => {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
};

export async function setPasswordAction(
  surface: AuthSurface,
  purpose: LinkPurpose,
  token: string,
  _prev: SetPasswordState,
  form: FormData,
): Promise<SetPasswordState> {
  const password = field(form, "password");
  const tooShort = validateNewPassword(password);
  if (tooShort) return { error: tooShort };
  if (password !== field(form, "confirm")) return { error: "mismatch" };

  const h = await headers();
  const result = await consumeLinkToken(surface, purpose, token, password, {
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
    userAgent: h.get("user-agent"),
  });
  if (!result.ok) return result.error === "too_short" ? { error: "too_short" } : { status: result.error };

  await setSessionCookie(surface, result.sessionToken);
  redirect(`${await getSurfaceBasePath()}/`);
}

export async function forgotPasswordAction(
  surface: AuthSurface,
  _prev: ForgotPasswordState,
  form: FormData,
): Promise<ForgotPasswordState> {
  const email = field(form, "email").trim();
  if (!email) return { sent: false, error: "email_required" };
  await requestPasswordReset(surface, email);
  return { sent: true };
}
