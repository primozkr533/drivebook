"use server";

import { DealerReadOnlyError, ForbiddenError, requireDealerUser } from "@/server/auth/permissions";
import { removeLogo, updatePrimaryColor, uploadLogo, type LogoError } from "@/server/data/settings-branding";

type AccessError = "forbidden" | "readOnly";

export type LogoFormState = {
  logoUrl: string | null;
  error?: LogoError | AccessError;
  saved?: "uploaded" | "removed";
};

export type ColorFormState = {
  primaryColor?: string;
  error?: "invalid" | AccessError;
  saved?: boolean;
};

function accessError(err: unknown): AccessError {
  if (err instanceof ForbiddenError) return "forbidden";
  if (err instanceof DealerReadOnlyError) return "readOnly";
  throw err;
}

export async function saveLogoAction(prev: LogoFormState, form: FormData): Promise<LogoFormState> {
  const { ctx } = await requireDealerUser();
  try {
    if (form.get("intent") === "remove") {
      await removeLogo(ctx);
      return { logoUrl: null, saved: "removed" };
    }
    const file = form.get("logo");
    if (!(file instanceof File) || file.size === 0) return { logoUrl: prev.logoUrl, error: "empty" };
    const result = await uploadLogo(ctx, {
      bytes: new Uint8Array(await file.arrayBuffer()),
      filename: file.name,
      declaredType: file.type,
    });
    if (!result.ok) return { logoUrl: prev.logoUrl, error: result.error };
    return { logoUrl: result.logoUrl, saved: "uploaded" };
  } catch (err) {
    return { logoUrl: prev.logoUrl, error: accessError(err) };
  }
}

export async function savePrimaryColorAction(_prev: ColorFormState, form: FormData): Promise<ColorFormState> {
  const { ctx } = await requireDealerUser();
  const value = form.get("primaryColor");
  const hex = typeof value === "string" ? value : "";
  try {
    const result = await updatePrimaryColor(ctx, hex);
    if (!result.ok) return { primaryColor: hex, error: result.error };
    return { primaryColor: result.primaryColor, saved: true };
  } catch (err) {
    return { primaryColor: hex, error: accessError(err) };
  }
}
