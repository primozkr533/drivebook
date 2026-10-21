"use client";

import { useActionState, type ReactNode } from "react";
import { Button, Input, Select, Stack, Text } from "@/components/ui";
import type { DealerFormState } from "../actions";

type Action = (state: DealerFormState, form: FormData) => Promise<DealerFormState>;
export type DealerFormErrors = Record<string, string>;

function useDealerForm(action: Action, errors: DealerFormErrors) {
  const [state, formAction, pending] = useActionState(action, {});
  const fieldError = (field: string) => (state.field === field && state.error ? errors[state.error] : undefined);
  const formError =
    state.error && !state.field ? (
      <Text size="small" tone="danger" role="alert" data-testid="dealer-form-error" data-state={state.error}>
        {errors[state.error]}
      </Text>
    ) : null;
  return { state, formAction, pending, fieldError, formError };
}

export function DealerProfileForm({
  action,
  initial,
  plans,
  labels,
}: {
  action: Action;
  initial: { name: string; planId: string; notes: string };
  plans: { id: string; name: string }[];
  labels: { name: string; planId: string; notes: string; notesHint: string; submit: string; errors: DealerFormErrors };
}) {
  const { state, formAction, pending, fieldError, formError } = useDealerForm(action, labels.errors);
  const values = state.values ?? initial;
  return (
    <form action={formAction} noValidate data-testid="dealer-profile-form">
      <Stack gap={6}>
        <Input
          label={labels.name}
          error={fieldError("name")}
          name="name"
          defaultValue={values.name}
          required
          data-testid="dealer-profile-name"
        />
        <Select
          label={labels.planId}
          error={fieldError("planId")}
          name="planId"
          defaultValue={values.planId}
          data-testid="dealer-profile-plan"
        >
          {plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <Input
          label={labels.notes}
          hint={labels.notesHint}
          name="notes"
          defaultValue={values.notes}
          data-testid="dealer-profile-notes"
        />
        {formError}
        <div>
          <Button type="submit" variant="primary" disabled={pending} data-testid="dealer-profile-submit">
            {labels.submit}
          </Button>
        </div>
      </Stack>
    </form>
  );
}

export function DealerSlugForm({
  action,
  initial,
  labels,
}: {
  action: Action;
  initial: string;
  labels: { field: string; hint: string; submit: string; errors: DealerFormErrors };
}) {
  const { state, formAction, pending, fieldError, formError } = useDealerForm(action, labels.errors);
  return (
    <form action={formAction} noValidate data-testid="dealer-slug-form">
      <Stack gap={4}>
        <Input
          label={labels.field}
          hint={labels.hint}
          error={fieldError("slug")}
          name="slug"
          defaultValue={state.values?.slug ?? initial}
          autoCapitalize="none"
          autoComplete="off"
          spellCheck={false}
          required
          data-testid="dealer-slug-input"
        />
        {formError}
        <div>
          <Button type="submit" variant="secondary" disabled={pending} data-testid="dealer-slug-submit">
            {labels.submit}
          </Button>
        </div>
      </Stack>
    </form>
  );
}

export function DealerLicenceForm({
  action,
  labels,
}: {
  action: Action;
  labels: { validUntil: string; note: string; noteHint: string; submit: string; errors: DealerFormErrors };
}) {
  const { state, formAction, pending, fieldError, formError } = useDealerForm(action, labels.errors);
  return (
    <form action={formAction} noValidate data-testid="dealer-licence-form">
      <Stack gap={4}>
        <div className="grid gap-4 md:grid-cols-2">
          <Input
            label={labels.validUntil}
            error={fieldError("validUntil")}
            name="validUntil"
            type="date"
            defaultValue={state.values?.validUntil ?? ""}
            required
            data-testid="dealer-licence-valid-until"
          />
          <Input
            label={labels.note}
            hint={labels.noteHint}
            error={fieldError("note")}
            name="note"
            defaultValue={state.values?.note ?? ""}
            required
            data-testid="dealer-licence-note"
          />
        </div>
        {formError}
        <div>
          <Button type="submit" variant="secondary" disabled={pending} data-testid="dealer-licence-submit">
            {labels.submit}
          </Button>
        </div>
      </Stack>
    </form>
  );
}

export function DealerDpaForm({
  action,
  initial,
  labels,
}: {
  action: Action;
  initial: string;
  labels: { signedAt: string; submit: string; errors: DealerFormErrors };
}) {
  const { state, formAction, pending, fieldError, formError } = useDealerForm(action, labels.errors);
  return (
    <form action={formAction} noValidate data-testid="dealer-dpa-form">
      <Stack gap={4}>
        <Input
          label={labels.signedAt}
          error={fieldError("signedAt")}
          name="signedAt"
          type="date"
          defaultValue={state.values?.signedAt ?? initial}
          required
          data-testid="dealer-dpa-signed-at"
        />
        {formError}
        <div>
          <Button type="submit" variant="secondary" disabled={pending} data-testid="dealer-dpa-submit">
            {labels.submit}
          </Button>
        </div>
      </Stack>
    </form>
  );
}

export function DealerButtonForm({
  action,
  hidden,
  variant,
  hint,
  submit,
  errors,
  testId,
}: {
  action: Action;
  hidden?: Record<string, string>;
  variant: "secondary" | "danger";
  hint?: ReactNode;
  submit: string;
  errors: DealerFormErrors;
  testId: string;
}) {
  const { formAction, pending, fieldError, formError } = useDealerForm(action, errors);
  const hiddenError = Object.keys(hidden ?? {}).map(fieldError).find(Boolean);
  return (
    <form action={formAction} className="flex flex-col items-start gap-3" data-testid={`${testId}-form`}>
      {hint ? (
        <Text size="small" tone="muted">
          {hint}
        </Text>
      ) : null}
      {Object.entries(hidden ?? {}).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <Button type="submit" variant={variant} disabled={pending} data-testid={testId}>
        {submit}
      </Button>
      {formError}
      {hiddenError ? (
        <Text size="small" tone="danger" role="alert" data-testid="dealer-form-error">
          {hiddenError}
        </Text>
      ) : null}
    </form>
  );
}
