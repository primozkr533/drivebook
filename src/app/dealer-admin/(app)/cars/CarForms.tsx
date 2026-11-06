"use client";

import { startTransition, useActionState, useId } from "react";
import { Button, Input, Stack, Switch, Text } from "@/components/ui";
import type { CarError, CarField } from "@/server/data/cars";
import type { AddCarState, CarFormValues, CarsActionError, CarToggleState, DeleteCarState, UpdateCarState } from "./actions";

type ActionErrors = Record<CarsActionError, string>;

export type CarFormLabels = {
  fields: Record<CarField, string>;
  optional: string;
  urlPlaceholder: string;
  notesPlaceholder: string;
  submit: string;
  added: string;
  addedManual: string;
  manualTitle: string;
  manualBody: string;
  save: string;
  saved: string;
  fieldErrors: Record<CarField, Partial<Record<CarError, string>>>;
  errors: ActionErrors;
};

const EMPTY: CarFormValues = { avtoNetUrl: "", notes: "", make: "", model: "", year: "", mileageKm: "", priceEur: "" };

function fieldErrorFor(labels: CarFormLabels, errors: Partial<Record<CarField, CarError>> | undefined) {
  return (field: CarField) => {
    const error = errors?.[field];
    return error ? (labels.fieldErrors[field][error] ?? labels.fieldErrors.notes.invalid) : undefined;
  };
}

function NotesField({ labels, value, error, testId }: { labels: CarFormLabels; value: string; error?: string; testId: string }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="type-utility text-ink">
        {labels.fields.notes} <span className="text-muted">({labels.optional})</span>
      </label>
      <textarea
        id={id}
        name="notes"
        rows={3}
        defaultValue={value}
        placeholder={labels.notesPlaceholder}
        aria-invalid={error ? true : undefined}
        className="w-full rounded-soft bg-surface px-3.5 py-2.5 text-body text-ink placeholder:text-muted shadow-[inset_0_0_0_1px_var(--line)] hover:shadow-[inset_0_0_0_1px_var(--ink-2)] focus:outline-none focus:shadow-[inset_0_0_0_2px_var(--ink)] aria-[invalid=true]:shadow-[inset_0_0_0_2px_var(--danger)]"
        data-testid={testId}
      />
      {error && <p className="text-small text-danger">{error}</p>}
    </div>
  );
}

function DetailFields({
  labels,
  values,
  fieldError,
  requireNames,
  suffix = "",
}: {
  suffix?: string;
  labels: CarFormLabels;
  values: CarFormValues;
  fieldError: (f: CarField) => string | undefined;
  requireNames: boolean;
}) {
  const opt = ` (${labels.optional})`;
  return (
    <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-5" data-testid={`car-details${suffix}`}>
      <Input label={labels.fields.make} name="make" defaultValue={values.make} error={fieldError("make")} required={requireNames} data-testid={`car-make${suffix}`} />
      <Input label={labels.fields.model} name="model" defaultValue={values.model} error={fieldError("model")} required={requireNames} data-testid={`car-model${suffix}`} />
      <Input label={labels.fields.year + opt} name="year" inputMode="numeric" defaultValue={values.year} error={fieldError("year")} data-testid={`car-year${suffix}`} />
      <Input
        label={labels.fields.mileageKm + opt}
        name="mileageKm"
        inputMode="numeric"
        suffix="km"
        defaultValue={values.mileageKm}
        error={fieldError("mileageKm")}
        data-testid={`car-mileage${suffix}`}
      />
      <Input
        label={labels.fields.priceEur + opt}
        name="priceEur"
        inputMode="numeric"
        suffix="€"
        defaultValue={values.priceEur}
        error={fieldError("priceEur")}
        data-testid={`car-price${suffix}`}
      />
    </div>
  );
}

export function AddCarForm({
  action,
  labels,
}: {
  action: (state: AddCarState, form: FormData) => Promise<AddCarState>;
  labels: CarFormLabels;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const values = state.values ?? EMPTY;
  const fieldError = fieldErrorFor(labels, state.errors);
  return (
    <form key={state.added?.id ?? "form"} action={formAction} noValidate data-testid="car-form">
      <Stack gap={6}>
        <Input
          label={labels.fields.avtoNetUrl}
          name="avtoNetUrl"
          type="url"
          inputMode="url"
          placeholder={labels.urlPlaceholder}
          defaultValue={values.avtoNetUrl}
          error={fieldError("avtoNetUrl")}
          required
          data-testid="car-url"
        />
        <NotesField labels={labels} value={values.notes} error={fieldError("notes")} testId="car-notes" />
        {state.needsDetails && (
          <div className="flex flex-col gap-4 border-l-2 border-warn pl-4" role="status" data-testid="car-manual">
            <div className="flex flex-col gap-1">
              <Text tone="ink" className="font-[650]">
                {labels.manualTitle}
              </Text>
              <Text size="small">{labels.manualBody}</Text>
            </div>
            <input type="hidden" name="manual" value="1" />
            <DetailFields labels={labels} values={values} fieldError={fieldError} requireNames />
          </div>
        )}
        {state.error && (
          <Text size="small" tone="danger" role="alert" data-testid="car-error" data-state={state.error}>
            {labels.errors[state.error]}
          </Text>
        )}
        {state.added && (
          <Text size="small" tone="ok" role="status" data-testid="car-added">
            {state.added.fromListing ? labels.added : labels.addedManual}
          </Text>
        )}
        <div>
          <Button type="submit" disabled={pending} data-testid="car-submit">
            {labels.submit}
          </Button>
        </div>
      </Stack>
    </form>
  );
}

export function EditCarForm({
  action,
  id,
  initial,
  labels,
}: {
  action: (state: UpdateCarState, form: FormData) => Promise<UpdateCarState>;
  id: string;
  initial: CarFormValues;
  labels: CarFormLabels;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const values = state.values ?? initial;
  const fieldError = fieldErrorFor(labels, state.errors);
  return (
    <form action={formAction} noValidate data-testid={`car-edit-form-${id}`}>
      <input type="hidden" name="id" value={id} />
      <Stack gap={6}>
        <DetailFields labels={labels} values={values} fieldError={fieldError} requireNames suffix={`-${id}`} />
        <NotesField labels={labels} value={values.notes} error={fieldError("notes")} testId={`car-notes-${id}`} />
        {state.error && (
          <Text size="small" tone="danger" role="alert" data-state={state.error}>
            {labels.errors[state.error]}
          </Text>
        )}
        {state.savedAt && !state.errors && !state.error && (
          <Text size="small" tone="ok" role="status" data-testid="car-saved">
            {labels.saved}
          </Text>
        )}
        <div>
          <Button type="submit" variant="secondary" disabled={pending} data-testid={`car-save-${id}`}>
            {labels.save}
          </Button>
        </div>
      </Stack>
    </form>
  );
}

export function CarActiveSwitch({
  action,
  id,
  active,
  labels,
}: {
  action: (state: CarToggleState, form: FormData) => Promise<CarToggleState>;
  id: string;
  active: boolean;
  labels: { label: string; hint: string; errors: ActionErrors };
}) {
  const [state, formAction, pending] = useActionState(action, { active });
  const toggle = (checked: boolean) => {
    const form = new FormData();
    form.set("id", id);
    form.set("active", String(checked));
    startTransition(() => formAction(form));
  };
  return (
    <Stack gap={2}>
      <Switch
        label={labels.label}
        hint={labels.hint}
        checked={state.active}
        disabled={pending}
        onChange={(e) => toggle(e.currentTarget.checked)}
        data-testid={`car-active-${id}`}
      />
      {state.error && (
        <Text size="small" tone="danger" role="alert" data-state={state.error}>
          {labels.errors[state.error]}
        </Text>
      )}
    </Stack>
  );
}

export function DeleteCarButton({
  action,
  id,
  labels,
}: {
  action: (state: DeleteCarState, form: FormData) => Promise<DeleteCarState>;
  id: string;
  labels: { submit: string; ariaLabel: string; errors: ActionErrors };
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="flex flex-col items-start gap-2">
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="danger" size="sm" disabled={pending} aria-label={labels.ariaLabel} data-testid={`car-delete-${id}`}>
        {labels.submit}
      </Button>
      {state.error && (
        <Text size="small" tone="danger" role="alert" data-testid="car-delete-error" data-state={state.error}>
          {labels.errors[state.error]}
        </Text>
      )}
    </form>
  );
}
