import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { AppHeader, Card, Container, PageHeader, Shell, Stack } from "@/components/ui";
import { getSurfaceBasePath } from "@/server/auth/permissions";
import { getCurrentSession } from "@/server/auth/session";
import { loginAction } from "./actions";
import { LoginForm } from "./LoginForm";

export type LoginSurface = "dealer" | "backoffice";

const keys = {
  dealer: { title: "dealerTitle", eyebrow: "eyebrowDealer" },
  backoffice: { title: "backofficeTitle", eyebrow: "eyebrowBackoffice" },
} as const;

export async function loginTitle(surface: LoginSurface) {
  const t = await getTranslations("auth");
  return t(keys[surface].title);
}

export async function LoginScreen({ surface }: { surface: LoginSurface }) {
  const basePath = await getSurfaceBasePath();
  if (await getCurrentSession(surface)) redirect(`${basePath}/`);

  const t = await getTranslations("auth");
  const labels = {
    email: t("email"),
    password: t("password"),
    submit: t("submit"),
    forgotPassword: t("forgotPassword"),
    totpLabel: t("totpLabel"),
    totpHint: t("totpHint"),
    totpSubmit: t("totpSubmit"),
    errors: {
      invalid: t("errorInvalid"),
      rate_limited: t("errorRateLimited"),
      totp_invalid: t("errorTotpInvalid"),
    },
  };
  return (
    <Shell header={<AppHeader />}>
      <Container width="narrow" className="py-10 md:py-16">
        <Stack gap={8}>
          <PageHeader eyebrow={t(keys[surface].eyebrow)} title={t(keys[surface].title)} />
          <Card pad="lg">
            <LoginForm
              action={loginAction.bind(null, surface)}
              labels={labels}
              forgotPasswordHref={`${basePath}/forgot-password`}
            />
          </Card>
        </Stack>
      </Container>
    </Shell>
  );
}
