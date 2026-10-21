import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Card, Container, PageHeader, Stack, Text } from "@/components/ui";
import { AccessDenied, requireOwnerPage } from "../owner-gate";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("settings"))("users.title") };
}

export default async function DealerUsersPage() {
  const gate = await requireOwnerPage();
  if (!gate.ok) {
    return (
      <Container className="py-10 md:py-16">
        <AccessDenied />
      </Container>
    );
  }
  const t = await getTranslations("settings");
  return (
    <Container className="py-10 md:py-16">
      <Stack gap={8}>
        <PageHeader title={t("users.title")} description={t("users.description")} />
        <Card data-testid="dealer-users">
          <Text tone="muted">{t("placeholder")}</Text>
        </Card>
      </Stack>
    </Container>
  );
}
