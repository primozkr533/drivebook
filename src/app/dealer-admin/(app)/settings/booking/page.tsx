import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Card, CardHeader, Text } from "@/components/ui";
import {
  BOOKING_RULE_DEFAULTS,
  BOOKING_RULE_LIMITS,
  getBookingRules,
  type BookingRuleError,
} from "@/server/data/settings-booking";
import { AccessDenied, requireOwnerPage } from "../../owner-gate";
import { saveBookingRulesAction } from "./actions";
import { BookingRulesForm, type BookingFieldLabels, type BookingRulesFormLabels } from "./BookingRulesForm";
import {
  BOOKING_FORM_FIELDS,
  BOOKING_FORM_RULE,
  BOOKING_FORM_UNIT,
  fromRuleValue,
  toFormValues,
  type BookingFormField,
} from "./fields";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("settings"))("sections.booking") };
}

export default async function SettingsBookingPage() {
  const gate = await requireOwnerPage();
  if (!gate.ok) return <AccessDenied />;
  const [rules, t] = await Promise.all([getBookingRules(gate.ctx), getTranslations("settingsBooking")]);

  const fieldLabels = (field: BookingFormField): BookingFieldLabels => {
    const limit = BOOKING_RULE_LIMITS[BOOKING_FORM_RULE[field]];
    const unit = BOOKING_FORM_UNIT[field];
    const range = t(`range.${unit}`, { min: fromRuleValue(field, limit.min), max: fromRuleValue(field, limit.max) });
    const step = limit.step ?? 1;
    const errors: Record<BookingRuleError, string> = {
      required: t("errors.required"),
      not_integer: unit === "hours" ? t("errors.notWholeMinutes") : t("errors.notInteger"),
      out_of_range: t("errors.outOfRange", { range }),
      invalid_step: limit.options ? t("errors.invalidOption") : t("errors.invalidStep", { step }),
    };
    return { label: t(`fields.${field}`), hint: t(`hints.${field}`, { range, step }), errors };
  };

  const labels: BookingRulesFormLabels = {
    groups: { durations: t("groups.durations"), capacity: t("groups.capacity"), timing: t("groups.timing") },
    fields: Object.fromEntries(BOOKING_FORM_FIELDS.map((field) => [field, fieldLabels(field)])) as BookingRulesFormLabels["fields"],
    slotOptions: (BOOKING_RULE_LIMITS.slotIntervalMinutes.options ?? []).map((value) => ({
      value,
      label: t("slotOption", { value }),
    })),
    submit: t("submit"),
    reset: t("reset"),
    resetHint: t("resetHint"),
    saved: t("saved"),
    errors: { forbidden: t("errors.forbidden"), readOnly: t("errors.readOnly") },
  };

  return (
    <Card data-testid="settings-booking">
      <CardHeader title={t("title")}>
        <Text size="small" tone="muted">
          {t("description")}
        </Text>
      </CardHeader>
      <BookingRulesForm
        action={saveBookingRulesAction}
        initial={toFormValues(rules)}
        defaults={toFormValues(BOOKING_RULE_DEFAULTS)}
        labels={labels}
      />
    </Card>
  );
}
