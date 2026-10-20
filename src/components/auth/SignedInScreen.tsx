import { getTranslations } from "next-intl/server";
import { AppHeader, Container, PageHeader, Shell, Text } from "@/components/ui";
import type { AuthSurface } from "@/server/auth/session";
import { LogoutButton } from "./LogoutButton";

// Minimal surface home so the post-login redirect has a target; the layouts ticket (#33) replaces it.
export async function SignedInScreen({ surface, email }: { surface: AuthSurface; email: string }) {
  const t = await getTranslations("auth");
  const eyebrow = surface === "dealer" ? t("eyebrowDealer") : t("eyebrowBackoffice");
  return (
    <Shell header={<AppHeader actions={<LogoutButton surface={surface} />} />}>
      <Container className="py-10 md:py-16">
        <PageHeader
          eyebrow={eyebrow}
          title={t("homeTitle")}
          description={<Text as="span" data-testid="signed-in-as">{t("signedInAs", { email })}</Text>}
        />
      </Container>
    </Shell>
  );
}
