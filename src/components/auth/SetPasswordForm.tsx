"use client";

import { useActionState } from "react";
import { Button, ButtonLink, Input, Stack, Text } from "@/components/ui";
import type { SetPasswordState } from "./link-actions";

export type SetPasswordLabels = {
  newPassword: string;
  newPasswordHint: string;
  confirmPassword: string;
  submit: string;
  errors: Record<NonNullable<SetPasswordState["error"]>, string>;
  status: Record<NonNullable<SetPasswordState["status"]>, LinkStatusContent>;
};

export function SetPasswordForm({
  action,
  labels,
}: {
  action: (state: SetPasswordState, form: FormData) => Promise<SetPasswordState>;
  labels: SetPasswordLabels;
}) {
  const [state, formAction, pending] = useActionState(action, {});

  // The link can expire or be used in another tab between opening the page and submitting.
  if (state.status) {
    return <LinkStatus {...labels.status[state.status]} />;
  }

  return (
    <form action={formAction} noValidate>
      <Stack gap={6}>
        <Input
          label={labels.newPassword}
          hint={labels.newPasswordHint}
          error={state.error === "too_short" ? labels.errors.too_short : undefined}
          name="password"
          type="password"
          autoComplete="new-password"
          required
          autoFocus
          data-testid="new-password"
        />
        <Input
          label={labels.confirmPassword}
          error={state.error === "mismatch" ? labels.errors.mismatch : undefined}
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          data-testid="confirm-password"
        />
        <div>
          <Button type="submit" disabled={pending} data-testid="set-password-submit">
            {labels.submit}
          </Button>
        </div>
      </Stack>
    </form>
  );
}

export type LinkStatusContent = { message: string; href: string; linkLabel: string };

export function LinkStatus({ message, href, linkLabel }: LinkStatusContent) {
  return (
    <Stack gap={6}>
      <Text role="status" data-testid="link-status">
        {message}
      </Text>
      <div>
        <ButtonLink href={href} variant="secondary">
          {linkLabel}
        </ButtonLink>
      </div>
    </Stack>
  );
}
