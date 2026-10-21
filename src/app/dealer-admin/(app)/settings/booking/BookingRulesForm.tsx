"use client";

import { useActionState, useState } from "react";
import { Button, Eyebrow, Input, Select, Stack, Text } from "@/components/ui";
import type { BookingRuleError } from "@/server/data/settings-booking";
import type { BookingRulesFormState } from "./actions";
import type { BookingFormField, BookingFormValues } from "./fields";

export type BookingFieldLabels = { label: string; hint: string; errors: Record<BookingRuleError, string> };

export type BookingRulesFormLabels = {
  groups: { durations: string; capacity: string; timing: string };
  fields: Record<BookingFormField, BookingFieldLabels>;
  slotOptions: { value: number; label: string }[];
  submit: string;
  reset: string;
  resetHint: string;
  saved: string;
  errors: Record<NonNullable<BookingRulesFormState["error"]>, string>;
};

const groups: { key: keyof BookingRulesFormLabels["groups"]; fields: BookingFormField[] }[] = [
  { key: "durations", fields: ["testDriveMinutes", "viewingMinutes", "otherMinutes"] },
  { key: "capacity", fields: ["capacity", "bufferMinutes", "slotIntervalMinutes"] },
  { key: "timing", fields: ["minNoticeHours", "horizonDays", "cancelCutoffHours"] },
];

const testId = (field: BookingFormField) => `booking-${field.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;

export function BookingRulesForm({
  action,
  initial,
  defaults,
  labels,
}: {
  action: (state: BookingRulesFormState, form: FormData) => Promise<BookingRulesFormState>;
  initial: BookingFormValues;
  defaults: BookingFormValues;
  labels: BookingRulesFormLabels;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  // A reset applies to the state it was pressed on; the next submit's state supersedes it.
  const [reset, setReset] = useState<{ on: BookingRulesFormState; count: number } | null>(null);
  const isReset = reset !== null && reset.on === state;
  const shown: BookingRulesFormState = isReset ? {} : state;
  const values = isReset ? defaults : (state.values ?? initial);

  const fieldError = (field: BookingFormField) => {
    const error = shown.errors?.[field];
    return error ? labels.fields[field].errors[error] : undefined;
  };

  const renderField = (field: BookingFormField) => {
    const { label, hint } = labels.fields[field];
    if (field === "slotIntervalMinutes") {
      return (
        <Select
          key={field}
          label={label}
          hint={hint}
          error={fieldError(field)}
          name={field}
          defaultValue={values[field]}
          data-testid={testId(field)}
        >
          {labels.slotOptions.map((option) => (
            <option key={option.value} value={String(option.value)}>
              {option.label}
            </option>
          ))}
        </Select>
      );
    }
    return (
      <Input
        key={field}
        label={label}
        hint={hint}
        error={fieldError(field)}
        name={field}
        type="number"
        inputMode="decimal"
        step="any"
        defaultValue={values[field]}
        required
        data-testid={testId(field)}
      />
    );
  };

  return (
    <form
      key={isReset ? `reset-${reset.count}` : "state"}
      action={formAction}
      noValidate
      data-testid="booking-rules-form"
    >
      <Stack gap={8}>
        {groups.map((group) => (
          <fieldset key={group.key}>
            <Eyebrow as="legend" className="mb-4">
              {labels.groups[group.key]}
            </Eyebrow>
            <div className="grid gap-6 md:grid-cols-3">{group.fields.map(renderField)}</div>
          </fieldset>
        ))}
        {shown.error ? (
          <Text size="small" tone="danger" role="alert" data-testid="booking-error" data-state={shown.error}>
            {labels.errors[shown.error]}
          </Text>
        ) : null}
        {shown.saved ? (
          <Text size="small" tone="ok" role="status" data-testid="booking-saved">
            {labels.saved}
          </Text>
        ) : null}
        {isReset ? (
          <Text size="small" tone="muted" role="status" data-testid="booking-reset-hint">
            {labels.resetHint}
          </Text>
        ) : null}
        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={pending} data-testid="booking-submit">
            {labels.submit}
          </Button>
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() => setReset({ on: state, count: (reset?.count ?? 0) + 1 })}
            data-testid="booking-reset"
          >
            {labels.reset}
          </Button>
        </div>
      </Stack>
    </form>
  );
}
