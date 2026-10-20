import { getTranslations } from "next-intl/server";
import { AppHeader, Button, Card, Container, Input, PageHeader, Shell, Stack, Text } from "@/components/ui";

export type LoginSurface = "dealer" | "backoffice";

const keys = {
  dealer: { title: "dealerTitle", eyebrow: "eyebrowDealer" },
  backoffice: { title: "backofficeTitle", eyebrow: "eyebrowBackoffice" },
} as const;

export async function loginTitle(surface: LoginSurface) {
  const t = await getTranslations("auth");
  return t(keys[surface].title);
}

// Mocked sign-in: no action and a disabled submit, so the form can never be sent.
export async function LoginScreen({ surface }: { surface: LoginSurface }) {
  const t = await getTranslations("auth");
  return (
    <Shell header={<AppHeader />}>
      <Container width="narrow" className="py-10 md:py-16">
        <Stack gap={8}>
          <PageHeader eyebrow={t(keys[surface].eyebrow)} title={t(keys[surface].title)} />
          <Card pad="lg">
            <form noValidate>
              <Stack gap={6}>
                <Input label={t("email")} name="email" type="email" autoComplete="email" />
                <Input label={t("password")} name="password" type="password" autoComplete="current-password" />
                <Text size="small" tone="muted">
                  {t("placeholderNote")}
                </Text>
                <div>
                  <Button type="submit" disabled>
                    {t("submit")}
                  </Button>
                </div>
              </Stack>
            </form>
          </Card>
        </Stack>
      </Container>
    </Shell>
  );
}
