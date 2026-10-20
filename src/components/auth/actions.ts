"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { login, logout } from "@/server/auth/login";
import { getSurfaceBasePath } from "@/server/auth/permissions";
import { clearSessionCookie, setSessionCookie, type AuthSurface } from "@/server/auth/session";

export type LoginState = {
  step: "password" | "totp";
  error?: "invalid" | "rate_limited" | "totp_invalid";
  email?: string;
  pendingToken?: string;
};

const field = (form: FormData, name: string) => {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
};

export async function loginAction(surface: AuthSurface, _prev: LoginState, form: FormData): Promise<LoginState> {
  const h = await headers();
  const email = field(form, "email");
  const result = await login({
    surface,
    email,
    password: field(form, "password"),
    totpCode: field(form, "totpCode") || undefined,
    pendingToken: field(form, "pendingToken") || undefined,
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown",
    userAgent: h.get("user-agent"),
  });

  if (result.ok) {
    await setSessionCookie(surface, result.token);
    redirect(`${await getSurfaceBasePath()}/`);
  }
  switch (result.error) {
    case "totp_required":
      return { step: "totp", email, pendingToken: result.pendingToken };
    case "totp_invalid":
      return { step: "totp", email, pendingToken: result.pendingToken, error: "totp_invalid" };
    default:
      return { step: "password", email, error: result.error };
  }
}

export async function logoutAction(surface: AuthSurface): Promise<void> {
  await logout(surface);
  await clearSessionCookie(surface);
  redirect(`${await getSurfaceBasePath()}/login`);
}
