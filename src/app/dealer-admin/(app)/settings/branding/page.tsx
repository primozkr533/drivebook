import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Card, CardHeader, Grid, Text } from "@/components/ui";
import { getBranding, MAX_LOGO_BYTES } from "@/server/data/settings-branding";
import { AccessDenied, requireOwnerPage } from "../../owner-gate";
import { saveLogoAction, savePrimaryColorAction } from "./actions";
import { ColorForm, LogoForm, type ColorFormLabels, type LogoFormLabels } from "./BrandingForms";

const LOGO_ACCEPT = "image/png,image/jpeg,image/svg+xml,image/webp";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("settings"))("sections.branding") };
}

export default async function SettingsBrandingPage() {
  const gate = await requireOwnerPage();
  if (!gate.ok) return <AccessDenied />;
  const [branding, t] = await Promise.all([getBranding(gate.ctx), getTranslations("settingsBranding")]);
  if (!branding) notFound();

  const accessErrors = { forbidden: t("errors.forbidden"), readOnly: t("errors.readOnly") };
  const logoLabels: LogoFormLabels = {
    current: t("logo.current"),
    placeholder: t("logo.placeholder"),
    file: t("logo.file"),
    hint: t("logo.hint"),
    upload: t("logo.upload"),
    remove: t("logo.remove"),
    uploaded: t("logo.uploaded"),
    removed: t("logo.removed"),
    errors: {
      too_large: t("logo.errors.too_large"),
      empty: t("logo.errors.empty"),
      unsupported_type: t("logo.errors.unsupported_type"),
      unsafe_svg: t("logo.errors.unsafe_svg"),
      ...accessErrors,
    },
  };
  const colorLabels: ColorFormLabels = {
    picker: t("color.picker"),
    hex: t("color.hex"),
    hexHint: t("color.hexHint"),
    preview: t("color.preview"),
    previewBand: t("color.previewBand"),
    previewButton: t("color.previewButton"),
    submit: t("color.submit"),
    saved: t("color.saved"),
    errors: { invalid: t("color.errors.invalid"), ...accessErrors },
  };

  return (
    <div data-testid="settings-branding">
      <Grid cols={2} from="lg" className="items-start">
        <Card data-testid="settings-branding-logo">
          <CardHeader title={t("logo.title")}>
            <Text size="small" tone="muted">
              {t("logo.description")}
            </Text>
          </CardHeader>
          <LogoForm
            action={saveLogoAction}
            initialLogoUrl={branding.logoUrl}
            maxBytes={MAX_LOGO_BYTES}
            accept={LOGO_ACCEPT}
            labels={logoLabels}
          />
        </Card>
        <Card data-testid="settings-branding-color">
          <CardHeader title={t("color.title")}>
            <Text size="small" tone="muted">
              {t("color.description")}
            </Text>
          </CardHeader>
          <ColorForm action={savePrimaryColorAction} initialColor={branding.primaryColor} labels={colorLabels} />
        </Card>
      </Grid>
    </div>
  );
}
