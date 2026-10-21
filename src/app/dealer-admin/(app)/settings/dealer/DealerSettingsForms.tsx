"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { Button, Input, Stack, Switch, Text } from "@/components/ui";
import type { SettingsFormState } from "./actions";

type Action = (state: SettingsFormState, form: FormData) => Promise<SettingsFormState>;
// Keyed "field.error" for field errors and "error" for form-level ones.
export type SettingsFormErrors = Record<string, string>;

const SMS_SENDER_MAX = 11;

function useSettingsForm(action: Action, errors: SettingsFormErrors, saved: string, testId: string) {
  const [state, formAction, pending] = useActionState(action, {});
  const fieldError = (field: string) =>
    state.field === field && state.error ? errors[`${field}.${state.error}`] : undefined;
  const status = state.saved ? (
    <Text size="small" tone="ink" role="status" data-testid={`${testId}-saved`}>
      {saved}
    </Text>
  ) : state.error && !state.field ? (
    <Text size="small" tone="danger" role="alert" data-testid={`${testId}-error`} data-state={state.error}>
      {errors[state.error]}
    </Text>
  ) : null;
  return { state, formAction, pending, fieldError, status };
}

type ProfileValues = {
  name: string;
  addressLine: string;
  postalCode: string;
  city: string;
  phone: string;
  email: string;
  googleMapsUrl: string;
  privacyPolicyUrl: string;
};

export function DealerProfileForm({
  action,
  initial,
  labels,
}: {
  action: Action;
  initial: ProfileValues;
  labels: {
    fields: ProfileValues;
    hints: { phone: string; googleMapsUrl: string; privacyPolicyUrl: string };
    submit: string;
    saved: string;
    errors: SettingsFormErrors;
  };
}) {
  const { state, formAction, pending, fieldError, status } = useSettingsForm(
    action,
    labels.errors,
    labels.saved,
    "settings-dealer-profile",
  );
  const values = { ...initial, ...state.values };
  const field = (name: keyof ProfileValues, props: { type?: string; hint?: string; autoComplete?: string } = {}) => (
    <Input
      label={labels.fields[name]}
      error={fieldError(name)}
      name={name}
      defaultValue={values[name]}
      data-testid={`settings-dealer-${name}`}
      {...props}
    />
  );
  return (
    <form action={formAction} noValidate data-testid="settings-dealer-profile-form">
      <Stack gap={6}>
        {field("name", { autoComplete: "organization" })}
        {field("addressLine", { autoComplete: "street-address" })}
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          {field("postalCode", { autoComplete: "postal-code" })}
          {field("city", { autoComplete: "address-level2" })}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {field("phone", { type: "tel", hint: labels.hints.phone, autoComplete: "tel" })}
          {field("email", { type: "email", autoComplete: "email" })}
        </div>
        {field("googleMapsUrl", { type: "url", hint: labels.hints.googleMapsUrl })}
        {field("privacyPolicyUrl", { type: "url", hint: labels.hints.privacyPolicyUrl })}
        {status}
        <div>
          <Button type="submit" variant="primary" disabled={pending} data-testid="settings-dealer-profile-submit">
            {labels.submit}
          </Button>
        </div>
      </Stack>
    </form>
  );
}

type SmsValues = { smsSenderName: string; smsNotificationsEnabled: boolean; notificationPhone: string };

export function SmsSettingsForm({
  action,
  initial,
  defaultSender,
  labels,
}: {
  action: Action;
  initial: SmsValues;
  defaultSender: string;
  labels: {
    fields: { smsSenderName: string; smsNotificationsEnabled: string; notificationPhone: string };
    hints: { smsSenderName: string; smsNotificationsEnabled: string; notificationPhone: string };
    submit: string;
    saved: string;
    errors: SettingsFormErrors;
  };
}) {
  const { state, formAction, pending, fieldError, status } = useSettingsForm(
    action,
    labels.errors,
    labels.saved,
    "settings-dealer-sms",
  );
  const values: SmsValues = state.values
    ? {
        smsSenderName: state.values.smsSenderName ?? "",
        smsNotificationsEnabled: state.values.smsNotificationsEnabled === "on",
        notificationPhone: state.values.notificationPhone ?? "",
      }
    : initial;
  const t = useTranslations("settingsDealer");
  const [senderLength, setSenderLength] = useState(values.smsSenderName.length);
  return (
    <form action={formAction} noValidate data-testid="settings-dealer-sms-form">
      <Stack gap={6}>
        <Input
          label={labels.fields.smsSenderName}
          hint={labels.hints.smsSenderName}
          error={fieldError("smsSenderName")}
          name="smsSenderName"
          defaultValue={values.smsSenderName}
          placeholder={defaultSender}
          onChange={(e) => setSenderLength(e.currentTarget.value.length)}
          suffix={<span data-testid="settings-dealer-sms-counter">{t("sms.counter", { count: senderLength, max: SMS_SENDER_MAX })}</span>}
          autoComplete="off"
          spellCheck={false}
          data-testid="settings-dealer-smsSenderName"
        />
        <Switch
          // Remount after a save so the checkbox reflects what was submitted.
          key={String(values.smsNotificationsEnabled)}
          label={labels.fields.smsNotificationsEnabled}
          hint={labels.hints.smsNotificationsEnabled}
          name="smsNotificationsEnabled"
          defaultChecked={values.smsNotificationsEnabled}
          data-testid="settings-dealer-smsNotificationsEnabled"
        />
        <Input
          label={labels.fields.notificationPhone}
          hint={labels.hints.notificationPhone}
          error={fieldError("notificationPhone")}
          name="notificationPhone"
          type="tel"
          autoComplete="tel"
          defaultValue={values.notificationPhone}
          data-testid="settings-dealer-notificationPhone"
        />
        {status}
        <div>
          <Button type="submit" variant="primary" disabled={pending} data-testid="settings-dealer-sms-submit">
            {labels.submit}
          </Button>
        </div>
      </Stack>
    </form>
  );
}
