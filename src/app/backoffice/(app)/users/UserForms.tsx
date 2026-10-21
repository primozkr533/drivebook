"use client";

import { useActionState } from "react";
import { Button, Input, Select, Stack, Text } from "@/components/ui";
import type { DeactivateUserState, InviteUserState } from "./actions";

export type UserErrors = Record<NonNullable<InviteUserState["error"]> | NonNullable<DeactivateUserState["error"]>, string>;

export type InviteUserLabels = {
  email: string;
  role: string;
  roles: { support: string; superadmin: string };
  hint: string;
  submit: string;
  errors: UserErrors;
};

export function InviteUserForm({
  action,
  labels,
}: {
  action: (state: InviteUserState, form: FormData) => Promise<InviteUserState>;
  labels: InviteUserLabels;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const values = state.values ?? { email: "", role: "support" };
  const error = state.error ? labels.errors[state.error] : undefined;

  return (
    <form action={formAction} noValidate data-testid="user-invite-form">
      <Stack gap={6}>
        <Text size="small" tone="muted">
          {labels.hint}
        </Text>
        <Input
          label={labels.email}
          error={state.error === "email" || state.error === "taken" ? error : undefined}
          name="email"
          type="email"
          autoComplete="off"
          defaultValue={values.email}
          required
          data-testid="user-invite-email"
        />
        <Select
          label={labels.role}
          error={state.error === "role" ? error : undefined}
          name="role"
          defaultValue={values.role}
          data-testid="user-invite-role"
        >
          <option value="support">{labels.roles.support}</option>
          <option value="superadmin">{labels.roles.superadmin}</option>
        </Select>
        {state.error === "forbidden" ? (
          <Text size="small" tone="danger" role="alert" data-testid="user-invite-error" data-state={state.error}>
            {error}
          </Text>
        ) : null}
        <div>
          <Button type="submit" disabled={pending} data-testid="user-invite-submit">
            {labels.submit}
          </Button>
        </div>
      </Stack>
    </form>
  );
}

export function DeactivateUserForm({
  action,
  labels,
}: {
  action: (state: DeactivateUserState, form: FormData) => Promise<DeactivateUserState>;
  labels: { submit: string; errors: UserErrors };
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="flex flex-col items-start gap-2" data-testid="user-deactivate-form">
      <Button type="submit" variant="danger" size="sm" disabled={pending} data-testid="user-deactivate">
        {labels.submit}
      </Button>
      {state.error ? (
        <Text size="small" tone="danger" role="alert" data-testid="user-deactivate-error" data-state={state.error}>
          {labels.errors[state.error]}
        </Text>
      ) : null}
    </form>
  );
}
