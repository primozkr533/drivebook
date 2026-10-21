"use client";

import { useActionState } from "react";
import { Button, Input, Select, Stack, Text } from "@/components/ui";
import type { CreateDealerError } from "@/server/data/backoffice/dealers";
import type { CreateDealerFormState, CreateDealerValues } from "./actions";

type Field = keyof CreateDealerValues;
export type CreateDealerFieldErrors = { [E in CreateDealerError as E["field"]]: Record<E["error"], string> };

export type CreateDealerLabels = {
  fields: Record<Field, string>;
  hints: { slug: string; licenceValidUntil: string; notes: string };
  submit: string;
  forbidden: string;
  errors: CreateDealerFieldErrors;
};

export function CreateDealerForm({
  action,
  initial,
  plans,
  labels,
}: {
  action: (state: CreateDealerFormState, form: FormData) => Promise<CreateDealerFormState>;
  initial: CreateDealerValues;
  plans: { id: string; name: string }[];
  labels: CreateDealerLabels;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const values = state.values ?? initial;
  const fieldError = (field: Field) =>
    state.field === field && state.error
      ? (labels.errors[state.field] as Record<string, string>)[state.error]
      : undefined;

  return (
    <form action={formAction} noValidate data-testid="dealer-create-form">
      <Stack gap={6}>
        <Input
          label={labels.fields.name}
          error={fieldError("name")}
          name="name"
          defaultValue={values.name}
          required
          data-testid="dealer-create-name"
        />
        <Input
          label={labels.fields.slug}
          hint={labels.hints.slug}
          error={fieldError("slug")}
          name="slug"
          defaultValue={values.slug}
          autoCapitalize="none"
          autoComplete="off"
          spellCheck={false}
          required
          data-testid="dealer-create-slug"
        />
        <Input
          label={labels.fields.ownerEmail}
          error={fieldError("ownerEmail")}
          name="ownerEmail"
          type="email"
          autoComplete="off"
          defaultValue={values.ownerEmail}
          required
          data-testid="dealer-create-owner-email"
        />
        <div className="grid gap-6 md:grid-cols-2">
          <Select
            label={labels.fields.planId}
            error={fieldError("planId")}
            name="planId"
            defaultValue={values.planId}
            data-testid="dealer-create-plan"
          >
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
          <Input
            label={labels.fields.licenceValidUntil}
            hint={labels.hints.licenceValidUntil}
            error={fieldError("licenceValidUntil")}
            name="licenceValidUntil"
            type="date"
            defaultValue={values.licenceValidUntil}
            required
            data-testid="dealer-create-licence"
          />
        </div>
        <Input
          label={labels.fields.notes}
          hint={labels.hints.notes}
          name="notes"
          defaultValue={values.notes}
          data-testid="dealer-create-notes"
        />
        {state.error === "forbidden" ? (
          <Text size="small" tone="danger" role="alert" data-testid="dealer-create-error" data-state={state.error}>
            {labels.forbidden}
          </Text>
        ) : null}
        <div>
          <Button type="submit" variant="primary" disabled={pending} data-testid="dealer-create-submit">
            {labels.submit}
          </Button>
        </div>
      </Stack>
    </form>
  );
}
