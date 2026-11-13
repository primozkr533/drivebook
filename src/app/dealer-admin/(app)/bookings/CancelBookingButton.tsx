"use client";

import { useActionState } from "react";
import { Button, Text } from "@/components/ui";
import type { CancelBookingError, CancelBookingState } from "./actions";

export function CancelBookingButton({
  action,
  id,
  labels,
}: {
  action: (state: CancelBookingState, form: FormData) => Promise<CancelBookingState>;
  id: string;
  labels: { submit: string; ariaLabel: string; hint: string; errors: Record<CancelBookingError, string> };
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="flex flex-col items-start gap-1.5 md:items-end">
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="danger" size="sm" disabled={pending} aria-label={labels.ariaLabel} title={labels.hint} data-testid={`booking-cancel-${id}`}>
        {labels.submit}
      </Button>
      {state.error && (
        <Text size="small" tone="danger" role="alert" data-state={state.error}>
          {labels.errors[state.error]}
        </Text>
      )}
    </form>
  );
}
