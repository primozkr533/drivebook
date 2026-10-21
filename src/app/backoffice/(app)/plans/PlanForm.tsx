"use client";

import { useActionState } from "react";
import { Button, Input, Stack, Text } from "@/components/ui";
import type { DeletePlanState, PlanFormState } from "./actions";

type Field = "name" | "monthlySmsQuota" | "maxUsers" | "notes";
type PlanErrors = Record<NonNullable<PlanFormState["error"]> | NonNullable<DeletePlanState["error"]>, string>;

export type PlanFormLabels = {
  fields: Record<Field, string>;
  hints: Record<Exclude<Field, "name">, string>;
  submit: string;
  errors: PlanErrors;
};

export function PlanForm({
  action,
  initial,
  labels,
}: {
  action: (state: PlanFormState, form: FormData) => Promise<PlanFormState>;
  initial: Record<Field, string>;
  labels: PlanFormLabels;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const values = state.values ?? initial;
  const fieldError = (field: Field) => (state.field === field && state.error ? labels.errors[state.error] : undefined);
  const formError = state.error && !state.field ? labels.errors[state.error] : undefined;

  return (
    <form action={formAction} noValidate data-testid="plan-form">
      <Stack gap={6}>
        <Input
          label={labels.fields.name}
          error={fieldError("name")}
          name="name"
          defaultValue={values.name}
          required
          data-testid="plan-name"
        />
        <div className="grid gap-6 md:grid-cols-2">
          <Input
            label={labels.fields.monthlySmsQuota}
            hint={labels.hints.monthlySmsQuota}
            error={fieldError("monthlySmsQuota")}
            name="monthlySmsQuota"
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            defaultValue={values.monthlySmsQuota}
            required
            data-testid="plan-quota"
          />
          <Input
            label={labels.fields.maxUsers}
            hint={labels.hints.maxUsers}
            error={fieldError("maxUsers")}
            name="maxUsers"
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            defaultValue={values.maxUsers}
            required
            data-testid="plan-max-users"
          />
        </div>
        <Input
          label={labels.fields.notes}
          hint={labels.hints.notes}
          name="notes"
          defaultValue={values.notes}
          data-testid="plan-notes"
        />
        {formError ? (
          <Text size="small" tone="danger" role="alert" data-testid="plan-error" data-state={state.error}>
            {formError}
          </Text>
        ) : null}
        <div>
          <Button type="submit" disabled={pending} data-testid="plan-submit">
            {labels.submit}
          </Button>
        </div>
      </Stack>
    </form>
  );
}

export function DeletePlanForm({
  action,
  labels,
}: {
  action: (state: DeletePlanState, form: FormData) => Promise<DeletePlanState>;
  labels: { submit: string; hint: string; errors: PlanErrors };
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} data-testid="plan-delete-form">
      <Stack gap={3}>
        <Text size="small" tone="muted">
          {labels.hint}
        </Text>
        {state.error ? (
          <Text size="small" tone="danger" role="alert" data-testid="plan-delete-error" data-state={state.error}>
            {labels.errors[state.error]}
          </Text>
        ) : null}
        <div>
          <Button type="submit" variant="danger" disabled={pending} data-testid="plan-delete">
            {labels.submit}
          </Button>
        </div>
      </Stack>
    </form>
  );
}
