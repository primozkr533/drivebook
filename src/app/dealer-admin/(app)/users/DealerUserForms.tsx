"use client";

import { useActionState } from "react";
import { Button, Input, Select, Stack, Text } from "@/components/ui";
import type { InviteDealerUserState, UserActionState } from "./actions";

type InviteError = NonNullable<InviteDealerUserState["error"]>;
type ActionError = NonNullable<UserActionState["error"]>;
export type DealerUserErrors = Record<InviteError | ActionError, string>;
export type RoleLabels = { owner: string; salesperson: string };

const FIELD_ERRORS: Partial<Record<InviteError, "email" | "name" | "role">> = {
  email: "email",
  taken: "email",
  name: "name",
  role: "role",
};

function FormError({ error, errors, testId }: { error?: InviteError | ActionError; errors: DealerUserErrors; testId: string }) {
  if (!error) return null;
  return (
    <Text size="small" tone="danger" role="alert" data-testid={testId} data-state={error}>
      {errors[error]}
    </Text>
  );
}

export function InviteDealerUserForm({
  action,
  disabledReason,
  labels,
}: {
  action: (state: InviteDealerUserState, form: FormData) => Promise<InviteDealerUserState>;
  disabledReason?: string;
  labels: {
    email: string;
    name: string;
    role: string;
    roles: RoleLabels;
    hint: string;
    submit: string;
    errors: DealerUserErrors;
  };
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const values = state.values ?? { email: "", name: "", role: "salesperson" };
  const field = state.error ? FIELD_ERRORS[state.error] : undefined;
  const fieldError = (name: "email" | "name" | "role") =>
    field === name && state.error ? labels.errors[state.error] : undefined;
  const disabled = Boolean(disabledReason);

  return (
    <form action={formAction} noValidate data-testid="dealer-user-invite-form" data-disabled={disabled || undefined}>
      <fieldset disabled={disabled} className="contents">
        <Stack gap={6}>
          <Text size="small" tone="muted">
            {labels.hint}
          </Text>
          {disabledReason ? (
            <Text size="small" tone="ink" role="status" data-testid="dealer-user-invite-limit">
              {disabledReason}
            </Text>
          ) : null}
          <Input
            label={labels.email}
            error={fieldError("email")}
            name="email"
            type="email"
            autoComplete="off"
            defaultValue={values.email}
            required
            data-testid="dealer-user-invite-email"
          />
          <Input
            label={labels.name}
            error={fieldError("name")}
            name="name"
            autoComplete="off"
            defaultValue={values.name}
            required
            data-testid="dealer-user-invite-name"
          />
          <Select
            label={labels.role}
            error={fieldError("role")}
            name="role"
            defaultValue={values.role}
            data-testid="dealer-user-invite-role"
          >
            <option value="owner">{labels.roles.owner}</option>
            <option value="salesperson">{labels.roles.salesperson}</option>
          </Select>
          {field ? null : <FormError error={state.error} errors={labels.errors} testId="dealer-user-invite-error" />}
          <div>
            <Button type="submit" variant="primary" disabled={pending || disabled} data-testid="dealer-user-invite-submit">
              {labels.submit}
            </Button>
          </div>
        </Stack>
      </fieldset>
    </form>
  );
}

export function ChangeRoleForm({
  action,
  userId,
  role,
  labels,
}: {
  action: (state: UserActionState, form: FormData) => Promise<UserActionState>;
  userId: string;
  role: string;
  labels: { role: string; roles: RoleLabels; submit: string; errors: DealerUserErrors };
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="flex flex-col items-start gap-2" data-testid="dealer-user-role-form">
      <input type="hidden" name="userId" value={userId} />
      <div className="flex flex-wrap items-end gap-2">
        <Select label={labels.role} name="role" defaultValue={role} data-testid="dealer-user-role">
          <option value="owner">{labels.roles.owner}</option>
          <option value="salesperson">{labels.roles.salesperson}</option>
        </Select>
        <Button type="submit" variant="secondary" size="sm" disabled={pending} data-testid="dealer-user-role-submit">
          {labels.submit}
        </Button>
      </div>
      <FormError error={state.error} errors={labels.errors} testId="dealer-user-role-error" />
    </form>
  );
}

export function UserStatusForm({
  action,
  userId,
  kind,
  labels,
}: {
  action: (state: UserActionState, form: FormData) => Promise<UserActionState>;
  userId: string;
  kind: "deactivate" | "reactivate";
  labels: { submit: string; errors: DealerUserErrors };
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="flex flex-col items-start gap-2" data-testid={`dealer-user-${kind}-form`}>
      <input type="hidden" name="userId" value={userId} />
      <Button
        type="submit"
        variant={kind === "deactivate" ? "danger" : "secondary"}
        size="sm"
        disabled={pending}
        data-testid={`dealer-user-${kind}`}
      >
        {labels.submit}
      </Button>
      <FormError error={state.error} errors={labels.errors} testId={`dealer-user-${kind}-error`} />
    </form>
  );
}
