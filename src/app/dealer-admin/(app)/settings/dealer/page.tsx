import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Card, CardHeader, Grid, Text } from "@/components/ui";
import { getDealerSettings } from "@/server/data/settings-dealer";
import { AccessDenied, requireOwnerPage } from "../../owner-gate";
import { saveDealerProfile, saveSmsSettings } from "./actions";
import { DealerProfileForm, SmsSettingsForm, type SettingsFormErrors } from "./DealerSettingsForms";

const fieldErrors = {
  name: ["required", "too_short", "too_long"],
  addressLine: ["too_long"],
  postalCode: ["too_long"],
  city: ["too_long"],
  phone: ["invalid"],
  email: ["invalid"],
  googleMapsUrl: ["invalid"],
  privacyPolicyUrl: ["invalid"],
  smsSenderName: ["too_long", "invalid"],
  notificationPhone: ["required", "invalid"],
} as const;
const formErrors = ["forbidden", "readOnly"] as const;

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("settings"))("sections.dealer") };
}

export default async function SettingsDealerPage() {
  const gate = await requireOwnerPage();
  if (!gate.ok) return <AccessDenied />;
  const [settings, t] = await Promise.all([getDealerSettings(gate.ctx), getTranslations("settingsDealer")]);
  if (!settings) notFound();

  const errors: SettingsFormErrors = Object.fromEntries([
    ...Object.entries(fieldErrors).flatMap(([field, keys]) =>
      keys.map((key) => [`${field}.${key}`, t(`errors.${field}.${key}` as Parameters<typeof t>[0])]),
    ),
    ...formErrors.map((key) => [key, t(`errors.${key}`)]),
  ]);

  return (
    <Grid cols={2} from="lg" className="items-start">
      <Card data-testid="settings-dealer-profile">
        <CardHeader title={t("profile.title")}>
          <Text size="small" tone="muted">
            {t("profile.description")}
          </Text>
        </CardHeader>
        <DealerProfileForm
          action={saveDealerProfile}
          initial={{
            name: settings.name,
            addressLine: settings.addressLine,
            postalCode: settings.postalCode,
            city: settings.city,
            phone: settings.phone,
            email: settings.email,
            googleMapsUrl: settings.googleMapsUrl ?? "",
            privacyPolicyUrl: settings.privacyPolicyUrl ?? "",
          }}
          labels={{
            fields: {
              name: t("profile.fields.name"),
              addressLine: t("profile.fields.addressLine"),
              postalCode: t("profile.fields.postalCode"),
              city: t("profile.fields.city"),
              phone: t("profile.fields.phone"),
              email: t("profile.fields.email"),
              googleMapsUrl: t("profile.fields.googleMapsUrl"),
              privacyPolicyUrl: t("profile.fields.privacyPolicyUrl"),
            },
            hints: {
              phone: t("profile.hints.phone"),
              googleMapsUrl: t("profile.hints.googleMapsUrl"),
              privacyPolicyUrl: t("profile.hints.privacyPolicyUrl"),
            },
            submit: t("profile.submit"),
            saved: t("profile.saved"),
            errors,
          }}
        />
      </Card>
      <Card data-testid="settings-dealer-sms">
        <CardHeader title={t("sms.title")}>
          <Text size="small" tone="muted">
            {t("sms.description")}
          </Text>
        </CardHeader>
        <SmsSettingsForm
          action={saveSmsSettings}
          initial={{
            smsSenderName: settings.smsSenderName ?? "",
            smsNotificationsEnabled: settings.smsNotificationsEnabled,
            notificationPhone: settings.notificationPhone ?? "",
          }}
          defaultSender={settings.effectiveSmsSenderName}
          labels={{
            fields: {
              smsSenderName: t("sms.fields.smsSenderName"),
              smsNotificationsEnabled: t("sms.fields.smsNotificationsEnabled"),
              notificationPhone: t("sms.fields.notificationPhone"),
            },
            hints: {
              smsSenderName: t("sms.hints.smsSenderName", { name: settings.effectiveSmsSenderName }),
              smsNotificationsEnabled: t("sms.hints.smsNotificationsEnabled"),
              notificationPhone: t("sms.hints.notificationPhone"),
            },
            submit: t("sms.submit"),
            saved: t("sms.saved"),
            errors,
          }}
        />
      </Card>
    </Grid>
  );
}
