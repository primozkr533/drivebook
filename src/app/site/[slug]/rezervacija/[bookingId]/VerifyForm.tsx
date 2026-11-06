"use client";

import { useActionState } from "react";
import { Button, Input, Stack, Text } from "@/components/ui";
import type { VerifyState } from "./actions";

export type VerifyFormLabels = {
  code: string;
  codeHint: string;
  submit: string;
  resend: string;
  wrongCode: string; // contains {attemptsLeft}
  unavailable: string;
  resent: Record<NonNullable<VerifyState["resent"]>, string>;
};

export function VerifyForm({
  verifyAction,
  resendAction,
  labels,
}: {
  verifyAction: (state: VerifyState, form: FormData) => Promise<VerifyState>;
  resendAction: (state: VerifyState) => Promise<VerifyState>;
  labels: VerifyFormLabels;
}) {
  const [state, formAction, pending] = useActionState(verifyAction, {});
  const [resendState, resend, resending] = useActionState(resendAction, {});
  const codeError =
    state.error === "wrong_code"
      ? labels.wrongCode.replace("{attemptsLeft}", String(state.attemptsLeft ?? 0))
      : state.error === "unavailable"
        ? labels.unavailable
        : undefined;
  return (
    <Stack gap={4}>
      <form action={formAction} noValidate data-testid="verify-form" className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="sm:w-56">
          <Input
            label={labels.code}
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            hint={labels.codeHint}
            error={codeError}
            className="font-mono text-h3 tracking-[0.3em] tabular"
            autoFocus
            required
            data-testid="verify-code"
          />
        </div>
        <Button type="submit" variant="brand" size="md" disabled={pending} className="sm:mt-6" data-testid="verify-submit">
          {labels.submit}
        </Button>
      </form>
      <form action={resend} className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="quiet" size="sm" disabled={resending} data-testid="verify-resend">
          {labels.resend}
        </Button>
        {resendState.resent && (
          <Text as="span" size="small" tone={resendState.resent === "ok" ? "ok" : "muted"} role="status" data-testid="verify-resent" data-state={resendState.resent}>
            {labels.resent[resendState.resent]}
          </Text>
        )}
        {resendState.error && (
          <Text as="span" size="small" tone="danger" role="alert">
            {labels.unavailable}
          </Text>
        )}
      </form>
    </Stack>
  );
}
