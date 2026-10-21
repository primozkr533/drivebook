"use client";

import { useActionState, useState } from "react";
import { Button, Input, Stack, Text } from "@/components/ui";
import { brandStyle } from "@/lib/color";
import type { ColorFormState, LogoFormState } from "./actions";

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

export type LogoFormLabels = {
  current: string;
  placeholder: string;
  file: string;
  hint: string;
  upload: string;
  remove: string;
  uploaded: string;
  removed: string;
  errors: Record<NonNullable<LogoFormState["error"]>, string>;
};

export type ColorFormLabels = {
  picker: string;
  hex: string;
  hexHint: string;
  preview: string;
  previewBand: string;
  previewButton: string;
  submit: string;
  saved: string;
  errors: Record<NonNullable<ColorFormState["error"]>, string>;
};

export function LogoForm({
  action,
  initialLogoUrl,
  maxBytes,
  accept,
  labels,
}: {
  action: (state: LogoFormState, form: FormData) => Promise<LogoFormState>;
  initialLogoUrl: string | null;
  maxBytes: number;
  accept: string;
  labels: LogoFormLabels;
}) {
  const [state, formAction, pending] = useActionState(action, { logoUrl: initialLogoUrl });
  const [tooLarge, setTooLarge] = useState(false);
  const error = tooLarge ? "too_large" : state.error;

  return (
    <form action={formAction} data-testid="branding-logo-form">
      <Stack gap={6}>
        <div className="flex flex-col gap-2">
          <span className="type-utility text-ink">{labels.current}</span>
          {state.logoUrl ? (
            // An app-relative /api/files/… path: used as-is, without the surface base path.
            <img
              src={state.logoUrl}
              alt={labels.current}
              className="h-24 w-full max-w-80 bg-surface-2 object-contain p-3"
              data-testid="branding-logo"
            />
          ) : (
            <div
              className="flex h-24 w-full max-w-80 items-center justify-center border border-dashed border-line-strong bg-surface-2 p-3"
              data-testid="branding-logo-placeholder"
            >
              <Text size="small" tone="muted">
                {labels.placeholder}
              </Text>
            </div>
          )}
        </div>
        <Input
          label={labels.file}
          hint={labels.hint}
          error={error ? labels.errors[error] : undefined}
          name="logo"
          type="file"
          accept={accept}
          className="py-2"
          onChange={(event) => setTooLarge((event.currentTarget.files?.[0]?.size ?? 0) > maxBytes)}
          data-testid="branding-logo-input"
        />
        {state.saved && !error ? (
          <Text size="small" tone="ok" role="status" data-testid="branding-logo-saved">
            {state.saved === "uploaded" ? labels.uploaded : labels.removed}
          </Text>
        ) : null}
        <div className="flex flex-wrap gap-3">
          <Button type="submit" name="intent" value="upload" disabled={pending || tooLarge} data-testid="branding-logo-upload">
            {labels.upload}
          </Button>
          {state.logoUrl ? (
            <Button
              type="submit"
              variant="danger"
              name="intent"
              value="remove"
              disabled={pending}
              data-testid="branding-logo-remove"
            >
              {labels.remove}
            </Button>
          ) : null}
        </div>
      </Stack>
    </form>
  );
}

export function ColorForm({
  action,
  initialColor,
  labels,
}: {
  action: (state: ColorFormState, form: FormData) => Promise<ColorFormState>;
  initialColor: string;
  labels: ColorFormLabels;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [draft, setDraft] = useState(initialColor);
  const [color, setColor] = useState(initialColor);
  const draftValid = HEX_RE.test(draft.trim());

  const changeDraft = (value: string) => {
    setDraft(value);
    if (HEX_RE.test(value.trim())) setColor(value.trim().toUpperCase());
  };

  return (
    <form action={formAction} data-testid="branding-color-form">
      <Stack gap={6}>
        <div className="grid gap-6 sm:grid-cols-4">
          <Input
            label={labels.picker}
            type="color"
            value={color.toLowerCase()}
            onChange={(event) => changeDraft(event.currentTarget.value.toUpperCase())}
            className="cursor-pointer px-1.5 py-1"
            data-testid="branding-color-picker"
          />
          <div className="sm:col-span-3">
            <Input
              label={labels.hex}
              hint={labels.hexHint}
              error={!draftValid ? labels.errors.invalid : state.error ? labels.errors[state.error] : undefined}
              name="primaryColor"
              value={draft}
              onChange={(event) => changeDraft(event.currentTarget.value)}
              maxLength={7}
              spellCheck={false}
              autoComplete="off"
              className="font-mono uppercase"
              data-testid="branding-color-hex"
            />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <span className="type-utility text-ink">{labels.preview}</span>
          <div
            style={brandStyle(color)}
            className="flex flex-col gap-4 border border-line p-4"
            data-testid="branding-preview"
          >
            <div className="bg-brand px-4 py-3 text-on-brand" data-testid="branding-preview-band">
              <span className="type-utility">{labels.previewBand}</span>
            </div>
            <div>
              <Button variant="brand" tabIndex={-1} aria-hidden data-testid="branding-preview-button">
                {labels.previewButton}
              </Button>
            </div>
          </div>
        </div>
        {state.saved && draftValid ? (
          <Text size="small" tone="ok" role="status" data-testid="branding-color-saved">
            {labels.saved}
          </Text>
        ) : null}
        <div>
          <Button type="submit" disabled={pending || !draftValid} data-testid="branding-color-submit">
            {labels.submit}
          </Button>
        </div>
      </Stack>
    </form>
  );
}
