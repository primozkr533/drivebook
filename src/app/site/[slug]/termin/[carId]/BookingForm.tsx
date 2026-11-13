"use client";

import { useActionState } from "react";
import { Button, Input, Stack, Text } from "@/components/ui";
import type { BookingError, BookingField } from "@/server/data/bookings";
import type { BookingFormState } from "./actions";

export type BookingFormLabels = {
  fields: Record<"name" | "phone" | "email" | "note", string>;
  optional: string;
  phoneHint: string;
  consent: string;
  privacy: string;
  submit: string;
  fieldErrors: Record<BookingField, Partial<Record<BookingError, string>>>;
  errors: Record<"readOnly" | "carGone", string>;
};

export function BookingForm({
  action,
  carId,
  kind,
  start,
  privacyHref,
  labels,
}: {
  action: (state: BookingFormState, form: FormData) => Promise<BookingFormState>;
  carId: string;
  kind: string;
  start: string;
  privacyHref: string;
  labels: BookingFormLabels;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const values = state.values ?? { name: "", phone: "", email: "", note: "" };
  const fieldError = (field: BookingField) => {
    const error = state.errors?.[field];
    return error ? (labels.fieldErrors[field][error] ?? labels.fieldErrors.name.invalid) : undefined;
  };
  const slotError = fieldError("start") ?? fieldError("kind");
  const opt = ` (${labels.optional})`;

  return (
    <form action={formAction} noValidate data-testid="booking-form">
      <input type="hidden" name="carId" value={carId} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="start" value={start} />
      <Stack gap={6}>
        <div className="grid gap-6 md:grid-cols-2">
          <Input label={labels.fields.name} name="name" autoComplete="name" defaultValue={values.name} error={fieldError("name")} required data-testid="booking-name" />
          <Input
            label={labels.fields.phone}
            name="phone"
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            defaultValue={values.phone}
            hint={labels.phoneHint}
            error={fieldError("phone")}
            required
            data-testid="booking-phone"
          />
          <Input
            label={labels.fields.email + opt}
            name="email"
            type="email"
            autoComplete="email"
            defaultValue={values.email}
            error={fieldError("email")}
            data-testid="booking-email"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="booking-note" className="type-utility text-ink">
            {labels.fields.note + opt}
          </label>
          <textarea
            id="booking-note"
            name="note"
            rows={3}
            defaultValue={values.note}
            aria-invalid={fieldError("note") ? true : undefined}
            className="w-full rounded-soft bg-surface px-3.5 py-2.5 text-body text-ink placeholder:text-muted shadow-[inset_0_0_0_1px_var(--line)] hover:shadow-[inset_0_0_0_1px_var(--ink-2)] focus:outline-none focus:shadow-[inset_0_0_0_2px_var(--ink)] aria-[invalid=true]:shadow-[inset_0_0_0_2px_var(--danger)]"
            data-testid="booking-note"
          />
          {fieldError("note") && <p className="text-small text-danger">{fieldError("note")}</p>}
        </div>
        {slotError && (
          <Text size="small" tone="danger" role="alert" data-testid="booking-slot-error">
            {slotError}
          </Text>
        )}
        {state.error && (
          <Text size="small" tone="danger" role="alert" data-testid="booking-error" data-state={state.error}>
            {labels.errors[state.error]}
          </Text>
        )}
        <Text size="small" tone="muted">
          {labels.consent}{" "}
          <a href={privacyHref} className="text-ink-2 underline underline-offset-4">
            {labels.privacy}
          </a>
        </Text>
        <div>
          <Button type="submit" variant="brand" size="lg" disabled={pending} data-testid="booking-submit">
            {labels.submit}
          </Button>
        </div>
      </Stack>
    </form>
  );
}
