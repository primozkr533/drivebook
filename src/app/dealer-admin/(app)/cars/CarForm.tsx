"use client";

import { useActionState, useEffect, useState, useTransition, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { CarSilhouette } from "@/components/signature";
import { Button, ButtonLink, Card, CardHeader, Grid, Input, Stack, Text } from "@/components/ui";
import { isCarImageTooLarge } from "@/lib/car-image-limits";
import { autofillFromAvtonetAction, saveCarAction, type CarFormField, type SaveCarState } from "./actions";
import { mergeAutofill, type CarDraft } from "./form-model";
import { carsListHref } from "./notice";

export type CarFormInitial = CarDraft & { id: string; avtonetUrl: string; currentImageUrl: string | null };

type Notice = { kind: "filled"; count: number } | { kind: "nothing" } | { kind: "failed"; reason: string };

type CarFormState = SaveCarState | (Omit<Extract<SaveCarState, { ok: false }>, "error"> & { error: "failed" });

// A rejected call (e.g. a body over the server-action limit) shows the form error instead of an error page.
async function saveCar(_prev: CarFormState | null, form: FormData): Promise<CarFormState> {
  try {
    return await saveCarAction(null, form);
  } catch {
    return { ok: false, fieldErrors: {}, error: "failed" };
  }
}

const isHttpUrl = (value: string) => /^https?:\/\/\S+$/i.test(value.trim());

export function CarForm({ initial, listHref }: { initial: CarFormInitial; listHref: string }) {
  const t = useTranslations("cars");
  const router = useRouter();
  const [state, formAction, saving] = useActionState<CarFormState | null, FormData>(saveCar, null);
  const [, startSave] = useTransition();
  const [autofilling, startAutofill] = useTransition();
  const [draft, setDraft] = useState<CarDraft>({
    make: initial.make,
    model: initial.model,
    year: initial.year,
    price: initial.price,
    imageUrl: initial.imageUrl,
  });
  const [avtonetUrl, setAvtonetUrl] = useState(initial.avtonetUrl);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [fileKey, setFileKey] = useState(0);
  const [fileTooLarge, setFileTooLarge] = useState(false);

  useEffect(() => {
    if (state?.ok) router.push(state.notice ? carsListHref(listHref, "active", state.notice) : listHref);
  }, [state, router, listHref]);

  useEffect(() => () => {
    if (filePreview) URL.revokeObjectURL(filePreview);
  }, [filePreview]);

  const fieldErrors = state && !state.ok ? state.fieldErrors : {};
  const fieldError = (name: CarFormField) => {
    const code = name === "imageFile" && fileTooLarge ? "too_large" : fieldErrors[name];
    return code ? t(`errors.${code}`) : undefined;
  };
  const formError = state && !state.ok ? state.error : undefined;
  const set = (key: keyof CarDraft) => (event: { currentTarget: { value: string } }) => {
    const value = event.currentTarget.value;
    setDraft((d) => ({ ...d, [key]: value }));
    if (key === "imageUrl" && value.trim()) setRemoveImage(false);
  };

  const currentImage = removeImage ? null : initial.currentImageUrl;
  const preview = filePreview ?? (isHttpUrl(draft.imageUrl) ? draft.imageUrl.trim() : currentImage);

  const autofill = () => {
    startAutofill(async () => {
      let result: Awaited<ReturnType<typeof autofillFromAvtonetAction>>;
      try {
        result = await autofillFromAvtonetAction(avtonetUrl);
      } catch {
        result = { ok: false, reason: "http_error" };
      }
      if (!result.ok) {
        setNotice({ kind: "failed", reason: result.reason });
        return;
      }
      const merged = mergeAutofill(draft, result.fields, { hasImage: Boolean(filePreview || currentImage) });
      setDraft(merged.draft);
      setNotice(merged.filled.length > 0 ? { kind: "filled", count: merged.filled.length } : { kind: "nothing" });
    });
  };

  // Submitting via a transition keeps the controlled fields: a plain form action would reset the form.
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const file = form.get("imageFile");
    if (file instanceof File && isCarImageTooLarge(file)) {
      setFileTooLarge(true);
      return;
    }
    startSave(() => formAction(form));
  };

  const clearFile = () => {
    setFileKey((k) => k + 1);
    setFilePreview(null);
    setFileTooLarge(false);
  };

  return (
    <form action={formAction} onSubmit={submit} noValidate data-testid="car-form">
      <input type="hidden" name="id" value={initial.id} />
      <input type="hidden" name="removeImage" value={removeImage ? "1" : ""} />
      <Stack gap={6}>
        {formError ? (
          <Text tone="danger" role="alert" data-testid="car-form-error" data-state={formError}>
            {t(`errors.${formError}`)}
          </Text>
        ) : null}
        <Grid cols={12} from="lg" className="items-start">
          <Card className="min-w-0 lg:col-span-7">
            <CardHeader title={t("form.details")} />
            <Stack gap={6}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                <div className="min-w-0 sm:flex-1">
                  <Input
                    label={t("form.avtonetUrl")}
                    hint={t("form.avtonetHint")}
                    error={fieldError("avtonetUrl")}
                    name="avtonetUrl"
                    type="url"
                    inputMode="url"
                    autoComplete="off"
                    value={avtonetUrl}
                    onChange={(event) => setAvtonetUrl(event.currentTarget.value)}
                    data-testid="car-avtonet-url"
                  />
                </div>
                <Button
                  variant="secondary"
                  className="sm:mt-6"
                  onClick={autofill}
                  disabled={autofilling || !avtonetUrl.trim()}
                  data-testid="car-autofill"
                >
                  {autofilling ? t("form.autofilling") : t("form.autofill")}
                </Button>
              </div>
              {notice ? (
                <Text
                  size="small"
                  tone={notice.kind === "failed" ? "warn" : "ink"}
                  role="status"
                  className="border-l-2 border-line-strong pl-3"
                  data-testid="car-autofill-notice"
                  data-state={notice.kind === "failed" ? notice.reason : notice.kind}
                >
                  {notice.kind === "failed"
                    ? t(`autofill.reasons.${notice.reason}`)
                    : notice.kind === "filled"
                      ? t("autofill.filled", { count: notice.count })
                      : t("autofill.nothing")}
                </Text>
              ) : null}
              <Grid cols={2} from="sm">
                <Input
                  label={t("form.make")}
                  error={fieldError("make")}
                  name="make"
                  autoComplete="off"
                  value={draft.make}
                  onChange={set("make")}
                  required
                  data-testid="car-make"
                />
                <Input
                  label={t("form.model")}
                  error={fieldError("model")}
                  name="model"
                  autoComplete="off"
                  value={draft.model}
                  onChange={set("model")}
                  required
                  data-testid="car-model"
                />
                <Input
                  label={t("form.year")}
                  error={fieldError("year")}
                  name="year"
                  inputMode="numeric"
                  autoComplete="off"
                  value={draft.year}
                  onChange={set("year")}
                  required
                  className="tabular"
                  data-testid="car-year"
                />
                <Input
                  label={t("form.price")}
                  error={fieldError("price")}
                  name="price"
                  inputMode="numeric"
                  autoComplete="off"
                  value={draft.price}
                  onChange={set("price")}
                  suffix={t("form.priceSuffix")}
                  required
                  className="tabular"
                  data-testid="car-price"
                />
              </Grid>
            </Stack>
          </Card>
          <Card className="min-w-0 lg:col-span-5">
            <CardHeader title={t("form.image")} />
            <Stack gap={6}>
              <div className="flex flex-col gap-2">
                <span className="type-utility text-ink">{t("form.preview")}</span>
                <div className="relative aspect-[16/10] overflow-hidden bg-surface-2" data-testid="car-image-preview">
                  {preview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={preview} alt={t("form.preview")} className="size-full object-cover" />
                  ) : (
                    <div className="grid size-full place-items-center p-6">
                      <CarSilhouette className="w-4/5 max-w-64" />
                      <span className="sr-only">{t("form.noImage")}</span>
                    </div>
                  )}
                </div>
              </div>
              <Input
                key={fileKey}
                label={t("form.imageFile")}
                hint={t("form.imageFileHint")}
                error={fieldError("imageFile")}
                name="imageFile"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="py-2"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  setFilePreview(file ? URL.createObjectURL(file) : null);
                  setFileTooLarge(isCarImageTooLarge(file));
                  if (file) setRemoveImage(false);
                }}
                data-testid="car-image-file"
              />
              <Input
                label={t("form.imageUrl")}
                hint={t("form.imageUrlHint")}
                error={fieldError("imageUrl")}
                name="imageUrl"
                type="url"
                inputMode="url"
                autoComplete="off"
                value={draft.imageUrl}
                onChange={set("imageUrl")}
                data-testid="car-image-url"
              />
              {initial.currentImageUrl ? (
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    variant={removeImage ? "secondary" : "danger"}
                    size="sm"
                    onClick={() => {
                      if (!removeImage) {
                        clearFile();
                        setDraft((d) => ({ ...d, imageUrl: "" }));
                      }
                      setRemoveImage(!removeImage);
                    }}
                    data-testid="car-image-remove"
                  >
                    {removeImage ? t("form.keepImage") : t("form.removeImage")}
                  </Button>
                  {removeImage ? (
                    <Text size="small" tone="muted" role="status">
                      {t("form.imageRemoved")}
                    </Text>
                  ) : null}
                </div>
              ) : null}
            </Stack>
          </Card>
        </Grid>
        <div className="flex flex-wrap items-center gap-4">
          <Button type="submit" variant="primary" disabled={saving} data-testid="car-save">
            {saving ? t("form.saving") : t("form.save")}
          </Button>
          <ButtonLink variant="quiet" href={listHref}>
            {t("back")}
          </ButtonLink>
        </div>
      </Stack>
    </form>
  );
}
