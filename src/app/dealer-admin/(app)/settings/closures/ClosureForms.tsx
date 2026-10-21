"use client";

import { startTransition, useActionState } from "react";
import { Button, Input, Stack, Switch, Text } from "@/components/ui";
import type { ClosureError, ClosureField } from "@/server/data/settings-hours";
import type {
  ClosureFormState,
  ClosuresActionError,
  DeleteClosureState,
  HolidayToggleState,
} from "./actions";

type ActionErrors = Record<ClosuresActionError, string>;

export function HolidaySwitch({
  action,
  id,
  openAnyway,
  labels,
}: {
  action: (state: HolidayToggleState, form: FormData) => Promise<HolidayToggleState>;
  id: string;
  openAnyway: boolean;
  labels: { label: string; hint: string; errors: ActionErrors };
}) {
  const [state, formAction, pending] = useActionState(action, { openAnyway });
  const toggle = (checked: boolean) => {
    const form = new FormData();
    form.set("id", id);
    form.set("openAnyway", String(checked));
    startTransition(() => formAction(form));
  };
  return (
    <Stack gap={2}>
      <Switch
        label={labels.label}
        hint={labels.hint}
        checked={state.openAnyway}
        disabled={pending}
        onChange={(e) => toggle(e.currentTarget.checked)}
        data-testid={`holiday-open-${id}`}
      />
      {state.error ? (
        <Text size="small" tone="danger" role="alert" data-testid="holiday-error" data-state={state.error}>
          {labels.errors[state.error]}
        </Text>
      ) : null}
    </Stack>
  );
}

export type ClosureFormLabels = {
  fields: Record<ClosureField, string>;
  reasonPlaceholder: string;
  submit: string;
  added: string;
  fieldErrors: Record<ClosureField, Partial<Record<ClosureError, string>>>;
  errors: ActionErrors;
};

export function AddClosureForm({
  action,
  today,
  labels,
}: {
  action: (state: ClosureFormState, form: FormData) => Promise<ClosureFormState>;
  today: string;
  labels: ClosureFormLabels;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const values = state.values ?? { startDate: "", endDate: "", reason: "" };
  const fieldError = (field: ClosureField) => {
    const error = state.errors?.[field];
    return error ? labels.fieldErrors[field][error] : undefined;
  };

  return (
    <form key={state.added ?? "form"} action={formAction} noValidate data-testid="closure-form">
      <Stack gap={6}>
        <div className="grid gap-6 md:grid-cols-2">
          <Input
            label={labels.fields.startDate}
            error={fieldError("startDate")}
            name="startDate"
            type="date"
            min={today}
            defaultValue={values.startDate}
            required
            data-testid="closure-start"
          />
          <Input
            label={labels.fields.endDate}
            error={fieldError("endDate")}
            name="endDate"
            type="date"
            min={today}
            defaultValue={values.endDate}
            data-testid="closure-end"
          />
        </div>
        <Input
          label={labels.fields.reason}
          error={fieldError("reason")}
          name="reason"
          placeholder={labels.reasonPlaceholder}
          defaultValue={values.reason}
          data-testid="closure-reason"
        />
        {state.error ? (
          <Text size="small" tone="danger" role="alert" data-testid="closure-error" data-state={state.error}>
            {labels.errors[state.error]}
          </Text>
        ) : null}
        {state.added ? (
          <Text size="small" tone="ok" role="status" data-testid="closure-added">
            {labels.added}
          </Text>
        ) : null}
        <div>
          <Button type="submit" disabled={pending} data-testid="closure-submit">
            {labels.submit}
          </Button>
        </div>
      </Stack>
    </form>
  );
}

export function DeleteClosureButton({
  action,
  id,
  labels,
}: {
  action: (state: DeleteClosureState, form: FormData) => Promise<DeleteClosureState>;
  id: string;
  labels: { submit: string; ariaLabel: string; errors: ActionErrors };
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="flex flex-col items-end gap-2">
      <input type="hidden" name="id" value={id} />
      <Button
        type="submit"
        variant="danger"
        size="sm"
        disabled={pending}
        aria-label={labels.ariaLabel}
        data-testid={`closure-delete-${id}`}
      >
        {labels.submit}
      </Button>
      {state.error ? (
        <Text size="small" tone="danger" role="alert" data-state={state.error}>
          {labels.errors[state.error]}
        </Text>
      ) : null}
    </form>
  );
}
