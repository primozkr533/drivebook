import { eq, sql } from "drizzle-orm";
import { dealers } from "@/db/schema";
import { requireDealerRole } from "@/server/auth/permissions";
import { normalizeEmail } from "@/server/auth/rate-limit";
import type { DealerContext } from "./context";
import { db } from "./db";
import { withDealerMutation } from "./mutate";

export const DEFAULT_SMS_SENDER_NAME = "DriveBook";
const SMS_SENDER_MAX = 11;
const NAME_MIN = 2;
const NAME_MAX = 100;
const ADDRESS_PART_MAX = 200;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SMS_SENDER_RE = /^[A-Za-z0-9 ]+$/;

export type DealerSettings = {
  name: string;
  addressLine: string;
  postalCode: string;
  city: string;
  phone: string;
  email: string;
  googleMapsUrl: string | null;
  privacyPolicyUrl: string | null;
  smsSenderName: string | null;
  effectiveSmsSenderName: string;
  smsNotificationsEnabled: boolean;
  notificationPhone: string | null;
};

export type SettingsError = "required" | "too_short" | "too_long" | "invalid";

export type DealerProfileInput = {
  name: string;
  addressLine?: string;
  postalCode?: string;
  city?: string;
  phone?: string;
  email?: string;
  googleMapsUrl?: string;
  privacyPolicyUrl?: string;
};

export type DealerProfileField = keyof DealerProfileInput;

export type UpdateDealerProfileResult = { ok: true } | { ok: false; field: DealerProfileField; error: SettingsError };

export type SmsSettingsInput = {
  smsSenderName?: string;
  smsNotificationsEnabled: boolean;
  notificationPhone?: string;
};

export type UpdateSmsSettingsResult =
  | { ok: true }
  | { ok: false; field: "smsSenderName" | "notificationPhone"; error: SettingsError };

export function defaultSmsSenderName(dealerName: string): string {
  const ascii = dealerName
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  const name = ascii
    .replace(/[^A-Za-z0-9 ]/g, "")
    .replace(/ +/g, " ")
    .trim()
    .slice(0, SMS_SENDER_MAX)
    .trim();
  return /[A-Za-z]/.test(name) ? name : DEFAULT_SMS_SENDER_NAME;
}

// Accepts international (+…/00…) numbers and Slovenian national ones (0xx…, which become +386…).
export function normalizePhone(raw: string): string | null {
  const compact = raw.trim().replace(/[\s\-./()]/g, "");
  let e164: string;
  if (compact.startsWith("+")) e164 = compact;
  else if (compact.startsWith("00")) e164 = `+${compact.slice(2)}`;
  else if (/^0[1-9]\d{7}$/.test(compact)) e164 = `+386${compact.slice(1)}`;
  else return null;
  return /^\+[1-9]\d{7,14}$/.test(e164) ? e164 : null;
}

function httpsUrl(raw: string): URL | null {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && url.hostname ? url : null;
  } catch {
    return null;
  }
}

function isGoogleMapsUrl(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  if (host === "google.com" || host.endsWith(".google.com")) return true;
  if (host === "maps.app.goo.gl") return true;
  return host === "goo.gl" && (url.pathname === "/maps" || url.pathname.startsWith("/maps/"));
}

export async function getDealerSettings(ctx: DealerContext): Promise<DealerSettings | null> {
  await requireDealerRole(ctx, ["owner"]);
  const [dealer] = await db().select().from(dealers).where(eq(dealers.id, ctx.dealerId)).limit(1);
  if (!dealer) return null;
  return {
    name: dealer.name,
    addressLine: dealer.addressLine,
    postalCode: dealer.postalCode,
    city: dealer.city,
    phone: dealer.phone,
    email: dealer.email,
    googleMapsUrl: dealer.mapsUrl,
    privacyPolicyUrl: dealer.privacyUrl,
    smsSenderName: dealer.smsSenderName,
    effectiveSmsSenderName: dealer.smsSenderName || defaultSmsSenderName(dealer.name),
    smsNotificationsEnabled: dealer.smsNotificationsEnabled,
    notificationPhone: dealer.notificationPhone,
  };
}

type ProfileValues = {
  name: string;
  addressLine: string;
  postalCode: string;
  city: string;
  phone: string;
  email: string;
  mapsUrl: string | null;
  privacyUrl: string | null;
};

function validateProfile(
  input: DealerProfileInput,
): { ok: true; values: ProfileValues } | Exclude<UpdateDealerProfileResult, { ok: true }> {
  const fail = (field: DealerProfileField, error: SettingsError) => ({ ok: false as const, field, error });

  const name = input.name.trim();
  if (!name) return fail("name", "required");
  if (name.length < NAME_MIN) return fail("name", "too_short");
  if (name.length > NAME_MAX) return fail("name", "too_long");

  const address = {
    addressLine: (input.addressLine ?? "").trim(),
    postalCode: (input.postalCode ?? "").trim(),
    city: (input.city ?? "").trim(),
  };
  for (const field of ["addressLine", "postalCode", "city"] as const) {
    if (address[field].length > ADDRESS_PART_MAX) return fail(field, "too_long");
  }

  const rawPhone = (input.phone ?? "").trim();
  const phone = rawPhone ? normalizePhone(rawPhone) : "";
  if (phone === null) return fail("phone", "invalid");

  const email = normalizeEmail(input.email ?? "");
  if (email && !EMAIL_RE.test(email)) return fail("email", "invalid");

  const rawMaps = (input.googleMapsUrl ?? "").trim();
  const maps = rawMaps ? httpsUrl(rawMaps) : null;
  if (rawMaps && (!maps || !isGoogleMapsUrl(maps))) return fail("googleMapsUrl", "invalid");

  const rawPrivacy = (input.privacyPolicyUrl ?? "").trim();
  if (rawPrivacy && !httpsUrl(rawPrivacy)) return fail("privacyPolicyUrl", "invalid");

  return {
    ok: true,
    values: {
      name,
      ...address,
      phone,
      email,
      mapsUrl: rawMaps || null,
      privacyUrl: rawPrivacy || null,
    },
  };
}

export async function updateDealerProfile(
  ctx: DealerContext,
  input: DealerProfileInput,
): Promise<UpdateDealerProfileResult> {
  const actor = await requireDealerRole(ctx, ["owner"]);
  const checked = validateProfile(input);
  if (!checked.ok) return checked;
  const { values } = checked;

  await withDealerMutation(
    ctx,
    async (tx) => {
      await tx
        .update(dealers)
        .set({
          ...values,
          // Same rule as the back-office rename: legalName follows name only while the two are still equal.
          legalName: sql`CASE WHEN ${dealers.legalName} = ${dealers.name} THEN ${values.name} ELSE ${dealers.legalName} END`,
          updatedAt: new Date(),
        })
        .where(eq(dealers.id, ctx.dealerId));
    },
    {
      action: "dealer.settings.profile.update",
      entity: "dealer",
      entityId: ctx.dealerId,
      actorKind: "dealer_user",
      actorId: actor.userId,
      data: values,
    },
  );
  return { ok: true };
}

export async function updateSmsSettings(ctx: DealerContext, input: SmsSettingsInput): Promise<UpdateSmsSettingsResult> {
  const actor = await requireDealerRole(ctx, ["owner"]);

  const sender = (input.smsSenderName ?? "").trim();
  if (sender) {
    if (sender.length > SMS_SENDER_MAX) return { ok: false, field: "smsSenderName", error: "too_long" };
    if (!SMS_SENDER_RE.test(sender) || !/[A-Za-z]/.test(sender)) {
      return { ok: false, field: "smsSenderName", error: "invalid" };
    }
  }

  const rawPhone = (input.notificationPhone ?? "").trim();
  if (!rawPhone && input.smsNotificationsEnabled) return { ok: false, field: "notificationPhone", error: "required" };
  const notificationPhone = rawPhone ? normalizePhone(rawPhone) : null;
  if (rawPhone && !notificationPhone) return { ok: false, field: "notificationPhone", error: "invalid" };

  const values = {
    smsSenderName: sender || null,
    smsNotificationsEnabled: input.smsNotificationsEnabled,
    notificationPhone,
  };
  await withDealerMutation(
    ctx,
    async (tx) => {
      await tx
        .update(dealers)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(dealers.id, ctx.dealerId));
    },
    {
      action: "dealer.settings.sms.update",
      entity: "dealer",
      entityId: ctx.dealerId,
      actorKind: "dealer_user",
      actorId: actor.userId,
      data: values,
    },
  );
  return { ok: true };
}
