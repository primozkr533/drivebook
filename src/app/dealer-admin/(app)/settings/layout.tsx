import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { Container, PageHeader, Stack } from "@/components/ui";
import { getSurfaceBasePath } from "@/server/auth/permissions";
import { AccessDenied, requireOwnerPage } from "../owner-gate";
import { SettingsNav } from "./SettingsNav";
import { SETTINGS_SECTIONS } from "./sections";

export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const gate = await requireOwnerPage();
  if (!gate.ok) {
    return (
      <Container className="py-10 md:py-16">
        <AccessDenied />
      </Container>
    );
  }
  const [t, basePath] = await Promise.all([getTranslations("settings"), getSurfaceBasePath()]);
  const items = SETTINGS_SECTIONS.map((section) => ({ label: t(`sections.${section}`), href: `${basePath}/settings/${section}` }));
  return (
    <Container className="py-10 md:py-16">
      <Stack gap={8}>
        <Stack gap={6}>
          <PageHeader title={t("title")} description={t("description")} />
          <SettingsNav label={t("subnavLabel")} items={items} />
        </Stack>
        {children}
      </Stack>
    </Container>
  );
}
