import { getTranslations } from "next-intl/server";
import { Card, Heading, Stack, Text } from "@/components/ui";
import { ForbiddenError, requireDealerRole, requireDealerUser } from "@/server/auth/permissions";
import type { DealerSession } from "@/server/auth/session";

export type OwnerPage = ({ ok: true } & Pick<DealerSession, "ctx" | "user">) | { ok: false };

export async function requireOwnerPage(): Promise<OwnerPage> {
  const { ctx, user } = await requireDealerUser();
  try {
    await requireDealerRole(ctx, ["owner"]);
  } catch (error) {
    if (error instanceof ForbiddenError) return { ok: false };
    throw error;
  }
  return { ok: true, ctx, user };
}

export async function AccessDenied() {
  const t = await getTranslations("settings");
  return (
    <Card data-testid="access-denied">
      <Stack gap={3}>
        <Heading size="h2">{t("accessDenied.title")}</Heading>
        <Text>{t("accessDenied.body")}</Text>
      </Stack>
    </Card>
  );
}
