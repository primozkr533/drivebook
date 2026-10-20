"use client";

import { useActionState } from "react";
import { Badge, Button, Card, CardHeader, Input, Stack, Text } from "@/components/ui";
import type { TotpState } from "./account-actions";

export type TotpLabels = {
  title: string;
  on: string;
  off: string;
  offDescription: string;
  enable: string;
  scan: string;
  qrAlt: string;
  secret: string;
  code: string;
  codeHint: string;
  confirm: string;
  onDescription: string;
  disablePassword: string;
  disable: string;
  status: Record<NonNullable<TotpState["status"]>, string>;
  errors: Record<NonNullable<TotpState["error"]>, string>;
};

export function TotpCard({
  action,
  labels,
  enabled,
}: {
  action: (state: TotpState, form: FormData) => Promise<TotpState>;
  labels: TotpLabels;
  enabled: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, { enabled });
  const message = state.error ? (
    <Text size="small" tone="danger" role="alert" data-testid="totp-error">
      {labels.errors[state.error]}
    </Text>
  ) : state.status ? (
    <Text size="small" tone="ok" role="status" data-testid="totp-status">
      {labels.status[state.status]}
    </Text>
  ) : null;

  return (
    <Card>
      <CardHeader
        title={labels.title}
        meta={
          <span data-testid="totp-state" data-state={state.enabled ? "on" : "off"}>
            <Badge tone={state.enabled ? "ok" : "neutral"}>{state.enabled ? labels.on : labels.off}</Badge>
          </span>
        }
      />
      {state.enabled ? (
        <form action={formAction} noValidate>
          <Stack gap={6}>
            <input type="hidden" name="intent" value="disable" />
            <Text>{labels.onDescription}</Text>
            <Input
              label={labels.disablePassword}
              name="password"
              type="password"
              autoComplete="current-password"
              required
              data-testid="totp-disable-password"
            />
            <CodeInput label={labels.code} testId="totp-disable-code" />
            {message}
            <div>
              <Button type="submit" variant="danger" disabled={pending} data-testid="totp-disable">
                {labels.disable}
              </Button>
            </div>
          </Stack>
        </form>
      ) : state.setup ? (
        <form action={formAction} noValidate>
          <Stack gap={6}>
            <input type="hidden" name="intent" value="confirm" />
            <Text>{labels.scan}</Text>
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={state.setup.qrDataUrl}
                alt={labels.qrAlt}
                width={176}
                height={176}
                className="size-44 shrink-0 bg-surface shadow-[inset_0_0_0_1px_var(--line)]"
                data-testid="totp-qr"
              />
              <div className="flex min-w-0 flex-col gap-1.5">
                <span className="type-utility text-ink">{labels.secret}</span>
                <code className="font-mono text-body text-ink break-all select-all" data-testid="totp-secret">
                  {state.setup.secret}
                </code>
              </div>
            </div>
            <CodeInput label={labels.code} hint={labels.codeHint} testId="totp-code" />
            {message}
            <div>
              <Button type="submit" variant="secondary" disabled={pending} data-testid="totp-confirm">
                {labels.confirm}
              </Button>
            </div>
          </Stack>
        </form>
      ) : (
        <form action={formAction}>
          <Stack gap={6}>
            <input type="hidden" name="intent" value="start" />
            <Text>{labels.offDescription}</Text>
            {message}
            <div>
              <Button type="submit" variant="secondary" disabled={pending} data-testid="totp-enable">
                {labels.enable}
              </Button>
            </div>
          </Stack>
        </form>
      )}
    </Card>
  );
}

function CodeInput({ label, hint, testId }: { label: string; hint?: string; testId: string }) {
  return (
    <Input
      label={label}
      hint={hint}
      name="code"
      inputMode="numeric"
      autoComplete="one-time-code"
      pattern="[0-9]*"
      maxLength={6}
      required
      data-testid={testId}
    />
  );
}
