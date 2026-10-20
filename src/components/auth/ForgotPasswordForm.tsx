"use client";

import { useActionState } from "react";
import { Button, ButtonLink, Input, Stack, Text } from "@/components/ui";
import type { ForgotPasswordState } from "./link-actions";

export type ForgotPasswordLabels = {
  email: string;
  submit: string;
  sent: string;
  emailRequired: string;
  backToLogin: string;
};

export function ForgotPasswordForm({
  action,
  labels,
  loginHref,
}: {
  action: (state: ForgotPasswordState, form: FormData) => Promise<ForgotPasswordState>;
  labels: ForgotPasswordLabels;
  loginHref: string;
}) {
  const [state, formAction, pending] = useActionState(action, { sent: false });
  const back = (
    <ButtonLink href={loginHref} variant="quiet" size="sm">
      {labels.backToLogin}
    </ButtonLink>
  );

  if (state.sent) {
    return (
      <Stack gap={6}>
        <Text role="status" data-testid="forgot-sent">
          {labels.sent}
        </Text>
        <div>{back}</div>
      </Stack>
    );
  }

  return (
    <form action={formAction} noValidate>
      <Stack gap={6}>
        <Input
          label={labels.email}
          error={state.error ? labels.emailRequired : undefined}
          name="email"
          type="email"
          autoComplete="email"
          required
          autoFocus
          data-testid="forgot-email"
        />
        <div className="flex flex-wrap items-center gap-6">
          <Button type="submit" disabled={pending} data-testid="forgot-submit">
            {labels.submit}
          </Button>
          {back}
        </div>
      </Stack>
    </form>
  );
}
