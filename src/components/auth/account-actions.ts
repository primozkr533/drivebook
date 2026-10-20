"use server";

import {
  changePassword,
  confirmTotpSetup,
  disableTotp,
  getAccountSummary,
  startTotpSetup,
} from "@/server/auth/account";
import { requireBackofficeUser, requireDealerUser } from "@/server/auth/permissions";
import type { AuthSurface } from "@/server/auth/session";

export type ChangePasswordState = {
  status?: "changed";
  error?: "wrong_password" | "too_short" | "mismatch";
};

export type TotpState = {
  enabled: boolean;
  setup?: { qrDataUrl: string; secret: string };
  status?: "enabled" | "disabled";
  error?: "invalid_code" | "wrong_password" | "no_pending_setup" | "not_enabled";
};

const field = (form: FormData, name: string) => {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
};

async function sessionUser(surface: AuthSurface): Promise<{ userId: string; sessionId: string }> {
  const { user, sessionId } = surface === "dealer" ? await requireDealerUser() : await requireBackofficeUser();
  return { userId: user.id, sessionId };
}

export async function changePasswordAction(
  surface: AuthSurface,
  _prev: ChangePasswordState,
  form: FormData,
): Promise<ChangePasswordState> {
  const { userId, sessionId } = await sessionUser(surface);
  const newPassword = field(form, "newPassword");
  if (newPassword !== field(form, "confirmPassword")) return { error: "mismatch" };
  const result = await changePassword(surface, userId, {
    currentPassword: field(form, "currentPassword"),
    newPassword,
    currentSessionId: sessionId,
  });
  return result.ok ? { status: "changed" } : { error: result.error };
}

export async function totpAction(surface: AuthSurface, prev: TotpState, form: FormData): Promise<TotpState> {
  const { userId } = await sessionUser(surface);
  switch (field(form, "intent")) {
    case "start": {
      // Another tab may have enabled 2FA already; starting would throw rather than overwrite it.
      if ((await getAccountSummary(surface, userId)).totpEnabled) return { enabled: true };
      const { qrDataUrl, secret } = await startTotpSetup(surface, userId);
      return { enabled: false, setup: { qrDataUrl, secret } };
    }
    case "confirm": {
      const result = await confirmTotpSetup(surface, userId, field(form, "code"));
      if (result.ok) return { enabled: true, status: "enabled" };
      return result.error === "no_pending_setup"
        ? { enabled: false, error: result.error }
        : { ...prev, status: undefined, error: result.error };
    }
    case "disable": {
      const result = await disableTotp(surface, userId, { password: field(form, "password"), code: field(form, "code") });
      if (result.ok) return { enabled: false, status: "disabled" };
      return result.error === "not_enabled" ? { enabled: false, error: result.error } : { enabled: true, error: result.error };
    }
    default:
      return prev;
  }
}
