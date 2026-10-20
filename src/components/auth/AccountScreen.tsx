import { getTranslations } from "next-intl/server";
import { Container, PageHeader, Text } from "@/components/ui";

// Account page body inside the (app) layouts; the account pages ticket (#37) adds the password and 2FA forms.
export async function AccountScreen({ email }: { email: string }) {
  const t = await getTranslations("account");
  return (
    <Container className="py-10 md:py-16">
      <PageHeader
        title={t("title")}
        description={
          <Text as="span" data-testid="signed-in-as">
            {t("signedInAs", { email })}
          </Text>
        }
      />
    </Container>
  );
}
