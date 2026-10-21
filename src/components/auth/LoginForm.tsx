"use client";

import { useActionState } from "react";
import { Button, ButtonLink, Input, Stack, Text } from "@/components/ui";
import type { LoginState } from "./actions";

export type LoginFormLabels = {
  email: string;
  password: string;
  submit: string;
  forgotPassword: string;
  totpLabel: string;
  totpHint: string;
  totpSubmit: string;
  errors: Record<NonNullable<LoginState["error"]>, string>;
};

export function LoginForm({
  action,
  labels,
  forgotPasswordHref,
}: {
  action: (state: LoginState, form: FormData) => Promise<LoginState>;
  labels: LoginFormLabels;
  forgotPasswordHref: string;
}) {
  const [state, formAction, pending] = useActionState(action, { step: "password" });
  const error = state.error ? (
    <Text size="small" tone="danger" role="alert" data-testid="login-error">
      {labels.errors[state.error]}
    </Text>
  ) : null;

  if (state.step === "totp") {
    return (
      <form action={formAction} noValidate>
        <Stack gap={6}>
          <input type="hidden" name="pendingToken" value={state.pendingToken ?? ""} />
          <input type="hidden" name="email" value={state.email ?? ""} />
          <Input
            label={labels.totpLabel}
            hint={labels.totpHint}
            name="totpCode"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            required
            autoFocus
            data-testid="login-totp"
          />
          {error}
          <div>
            <Button type="submit" disabled={pending} data-testid="login-submit">
              {labels.totpSubmit}
            </Button>
          </div>
        </Stack>
      </form>
    );
  }

  return (
    <form action={formAction} noValidate>
      <Stack gap={6}>
        <Input
          label={labels.email}
          name="email"
          type="email"
          autoComplete="email"
          defaultValue={state.email}
          required
          data-testid="login-email"
        />
        <Input
          label={labels.password}
          name="password"
          type="password"
          autoComplete="current-password"
          required
          data-testid="login-password"
        />
        {error}
        <div className="flex flex-wrap items-center gap-6">
          <Button type="submit" disabled={pending} data-testid="login-submit">
            {labels.submit}
          </Button>
          <ButtonLink href={forgotPasswordHref} variant="quiet" size="sm">
            {labels.forgotPassword}
          </ButtonLink>
        </div>
      </Stack>
    </form>
  );
}
