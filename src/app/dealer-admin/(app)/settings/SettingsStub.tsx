import { getTranslations } from "next-intl/server";
import { Card, CardHeader, Text } from "@/components/ui";
import type { SettingsSection } from "./sections";

// Placeholder until the section's own page ticket replaces it.
export async function SettingsStub({ section }: { section: SettingsSection }) {
  const t = await getTranslations("settings");
  return (
    <Card data-testid={`settings-${section}`}>
      <CardHeader title={t(`sections.${section}`)} />
      <Text tone="muted">{t("placeholder")}</Text>
    </Card>
  );
}
