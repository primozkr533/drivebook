import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AppHeader, Card, Container, PageHeader, Shell, Stack } from "@/components/ui";
import { inspectLinkToken, type LinkPurpose } from "@/server/auth/links";
import { PASSWORD_MIN_LENGTH } from "@/server/auth/password";
import { getSurfaceBasePath } from "@/server/auth/permissions";
import { getCurrentSession, getDealerContextFromSession, type AuthSurface } from "@/server/auth/session";
import { ForgotPasswordForm } from "./ForgotPasswordForm";
import { forgotPasswordAction, setPasswordAction } from "./link-actions";
import { LinkStatus, SetPasswordForm, type SetPasswordLabels } from "./SetPasswordForm";

const eyebrowKey = { dealer: "eyebrowDealer", backoffice: "eyebrowBackoffice" } as const;
const titleKey = { invite: "setPasswordTitle", reset: "resetPasswordTitle" } as const;

export async function passwordPageTitle(page: LinkPurpose | "forgot") {
  const t = await getTranslations("auth");
  return t(page === "forgot" ? "forgotTitle" : titleKey[page]);
}

async function Frame({
  surface,
  title,
  description,
  children,
}: {
  surface: AuthSurface;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const t = await getTranslations("auth");
  return (
    <Shell header={<AppHeader />}>
      <Container width="narrow" className="py-10 md:py-16">
        <Stack gap={8}>
          <PageHeader eyebrow={t(eyebrowKey[surface])} title={title} description={description} />
          <Card pad="lg">{children}</Card>
        </Stack>
      </Container>
    </Shell>
  );
}

export async function SetPasswordScreen({
  surface,
  purpose,
  token,
}: {
  surface: AuthSurface;
  purpose: LinkPurpose;
  token: string;
}) {
  const t = await getTranslations("auth");
  const basePath = await getSurfaceBasePath();
  const login = { href: `${basePath}/login`, linkLabel: t("backToLogin") };
  const status: SetPasswordLabels["status"] = {
    expired:
      purpose === "invite"
        ? { message: t("inviteExpired"), ...login }
        : { message: t("resetExpired"), href: `${basePath}/forgot-password`, linkLabel: t("requestNewLink") },
    used: { message: t("linkUsed"), ...login },
    invalid: { message: t("linkInvalid"), ...login },
  };

  const state = await inspectLinkToken(surface, purpose, token);
  if (state !== "valid") {
    return (
      <Frame surface={surface} title={t("linkTitle")}>
        <LinkStatus {...status[state]} />
      </Frame>
    );
  }

  const labels: SetPasswordLabels = {
    newPassword: t("newPassword"),
    newPasswordHint: t("newPasswordHint", { min: PASSWORD_MIN_LENGTH }),
    confirmPassword: t("confirmPassword"),
    submit: t(purpose === "invite" ? "setPasswordSubmit" : "resetPasswordSubmit"),
    errors: {
      too_short: t("errorPasswordTooShort", { min: PASSWORD_MIN_LENGTH }),
      mismatch: t("errorPasswordMismatch"),
    },
    status,
  };
  return (
    <Frame
      surface={surface}
      title={t(titleKey[purpose])}
      description={t(purpose === "invite" ? "setPasswordDescription" : "resetPasswordDescription")}
    >
      <SetPasswordForm action={setPasswordAction.bind(null, surface, purpose, token)} labels={labels} />
    </Frame>
  );
}

export async function ForgotPasswordScreen({ surface }: { surface: AuthSurface }) {
  const basePath = await getSurfaceBasePath();
  // Dealer home also needs the dealer row (requireDealerUser); a bare session would loop back here.
  const signedIn = surface === "dealer" ? await getDealerContextFromSession() : await getCurrentSession(surface);
  if (signedIn) redirect(`${basePath}/`);

  const t = await getTranslations("auth");
  return (
    <Frame surface={surface} title={t("forgotTitle")} description={t("forgotDescription")}>
      <ForgotPasswordForm
        action={forgotPasswordAction.bind(null, surface)}
        labels={{
          email: t("email"),
          submit: t("forgotSubmit"),
          sent: t("forgotSent"),
          emailRequired: t("errorEmailRequired"),
          backToLogin: t("backToLogin"),
        }}
        loginHref={`${basePath}/login`}
      />
    </Frame>
  );
}
