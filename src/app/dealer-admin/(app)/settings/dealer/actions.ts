"use server";

import { DealerReadOnlyError, ForbiddenError, requireDealerUser } from "@/server/auth/permissions";
import { updateDealerProfile, updateSmsSettings } from "@/server/data/settings-dealer";

export type SettingsFormState = {
  values?: Record<string, string>;
  field?: string;
  error?: string;
  saved?: boolean;
};

const PROFILE_FIELDS = [
  "name",
  "addressLine",
  "postalCode",
  "city",
  "phone",
  "email",
  "googleMapsUrl",
  "privacyPolicyUrl",
] as const;

const text = (form: FormData, name: string) => {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
};

async function run(
  values: Record<string, string>,
  save: () => Promise<{ ok: true } | { ok: false; field: string; error: string }>,
): Promise<SettingsFormState> {
  let result;
  try {
    result = await save();
  } catch (err) {
    if (err instanceof ForbiddenError) return { error: "forbidden" };
    if (err instanceof DealerReadOnlyError) return { values, error: "readOnly" };
    throw err;
  }
  if (!result.ok) return { values, field: result.field, error: result.error };
  return { values, saved: true };
}

export async function saveDealerProfile(_prev: SettingsFormState, form: FormData): Promise<SettingsFormState> {
  const { ctx } = await requireDealerUser();
  const values = Object.fromEntries(PROFILE_FIELDS.map((field) => [field, text(form, field)])) as Record<
    (typeof PROFILE_FIELDS)[number],
    string
  >;
  return run(values, () => updateDealerProfile(ctx, values));
}

export async function saveSmsSettings(_prev: SettingsFormState, form: FormData): Promise<SettingsFormState> {
  const { ctx } = await requireDealerUser();
  const values = {
    smsSenderName: text(form, "smsSenderName"),
    smsNotificationsEnabled: form.get("smsNotificationsEnabled") ? "on" : "",
    notificationPhone: text(form, "notificationPhone"),
  };
  return run(values, () =>
    updateSmsSettings(ctx, {
      smsSenderName: values.smsSenderName,
      smsNotificationsEnabled: values.smsNotificationsEnabled === "on",
      notificationPhone: values.notificationPhone,
    }),
  );
}
