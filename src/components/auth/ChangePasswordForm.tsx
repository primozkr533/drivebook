"use client";

import { useActionState } from "react";
import { Button, Input, Stack, Text } from "@/components/ui";
import type { ChangePasswordState } from "./account-actions";

export type ChangePasswordLabels = {
  currentPassword: string;
  newPassword: string;
  newPasswordHint: string;
  confirmPassword: string;
  submit: string;
  changed: string;
  errors: Record<NonNullable<ChangePasswordState["error"]>, string>;
};

export function ChangePasswordForm({
  action,
  labels,
}: {
  action: (state: ChangePasswordState, form: FormData) => Promise<ChangePasswordState>;
  labels: ChangePasswordLabels;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} noValidate>
      <Stack gap={6}>
        <Input
          label={labels.currentPassword}
          error={state.error === "wrong_password" ? labels.errors.wrong_password : undefined}
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
          data-testid="current-password"
        />
        <Input
          label={labels.newPassword}
          hint={labels.newPasswordHint}
          error={state.error === "too_short" ? labels.errors.too_short : undefined}
          name="newPassword"
          type="password"
          autoComplete="new-password"
          required
          data-testid="new-password"
        />
        <Input
          label={labels.confirmPassword}
          error={state.error === "mismatch" ? labels.errors.mismatch : undefined}
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          data-testid="confirm-password"
        />
        {state.status || state.error ? (
          <Text
            size="small"
            tone={state.error ? "danger" : "ok"}
            role={state.error ? "alert" : "status"}
            data-testid="account-status"
            data-state={state.error ?? state.status}
          >
            {state.error ? labels.errors[state.error] : labels.changed}
          </Text>
        ) : null}
        <div>
          <Button type="submit" disabled={pending} data-testid="change-password-submit">
            {labels.submit}
          </Button>
        </div>
      </Stack>
    </form>
  );
}
