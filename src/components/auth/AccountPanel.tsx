import { getTranslations } from "next-intl/server";
import { Card, CardHeader, Container, Grid, PageHeader, Stack, Text } from "@/components/ui";
import { getAccountSummary } from "@/server/auth/account";
import { PASSWORD_MIN_LENGTH } from "@/server/auth/password";
import { requireBackofficeUser, requireDealerUser } from "@/server/auth/permissions";
import type { AuthSurface } from "@/server/auth/session";
import { changePasswordAction, totpAction } from "./account-actions";
import { ChangePasswordForm } from "./ChangePasswordForm";
import { TotpCard } from "./TotpCard";

const roleKeys = ["owner", "salesperson", "superadmin", "support"] as const;

export async function AccountPanel({ surface }: { surface: AuthSurface }) {
  const { user } = surface === "dealer" ? await requireDealerUser() : await requireBackofficeUser();
  const [summary, t, tAuth] = await Promise.all([
    getAccountSummary(surface, user.id),
    getTranslations("account"),
    getTranslations("auth"),
  ]);
  const min = PASSWORD_MIN_LENGTH;
  const role = roleKeys.find((r) => r === summary.role);

  return (
    <Container className="py-10 md:py-16">
      <Stack gap={8}>
        <PageHeader
          title={t("title")}
          description={
            <Text as="span" data-testid="signed-in-as">
              {t("signedInAs", { email: summary.email })}
            </Text>
          }
        />
        <Grid cols={12} from="lg">
          <Stack gap={6} className="lg:col-span-8">
            <Card>
              <CardHeader title={t("passwordTitle")}>
                <Text size="small" tone="muted">
                  {t("passwordDescription")}
                </Text>
              </CardHeader>
              <ChangePasswordForm
                action={changePasswordAction.bind(null, surface)}
                labels={{
                  currentPassword: t("currentPassword"),
                  newPassword: t("newPassword"),
                  newPasswordHint: t("newPasswordHint", { min }),
                  confirmPassword: t("confirmPassword"),
                  submit: t("changePasswordSubmit"),
                  changed: t("passwordChanged"),
                  errors: {
                    wrong_password: t("errorWrongPassword"),
                    too_short: t("errorTooShort", { min }),
                    mismatch: t("errorMismatch"),
                    rate_limited: tAuth("errorRateLimited"),
                  },
                }}
              />
            </Card>
            <TotpCard
              action={totpAction.bind(null, surface)}
              enabled={summary.totpEnabled}
              labels={{
                title: t("totpTitle"),
                on: t("totpOn"),
                off: t("totpOff"),
                offDescription: t("totpOffDescription"),
                enable: t("totpEnable"),
                scan: t("totpScan"),
                qrAlt: t("totpQrAlt"),
                secret: t("totpSecret"),
                code: t("totpCode"),
                codeHint: t("totpCodeHint"),
                confirm: t("totpConfirm"),
                onDescription: t("totpOnDescription"),
                disablePassword: t("totpDisablePassword"),
                disable: t("totpDisable"),
                status: { enabled: t("totpEnabled"), disabled: t("totpDisabled") },
                errors: {
                  invalid_code: t("errorInvalidCode"),
                  wrong_password: t("errorTotpWrongPassword"),
                  no_pending_setup: t("errorNoPendingSetup"),
                  not_enabled: t("errorNotEnabled"),
                  rate_limited: tAuth("errorRateLimited"),
                },
              }}
            />
          </Stack>
          <Card tone="sunken" className="self-start lg:col-span-4">
            <CardHeader title={t("detailsTitle")} />
            <dl className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <dt className="type-utility text-muted">{t("email")}</dt>
                <dd className="text-body text-ink break-all" data-testid="account-email">
                  {summary.email}
                </dd>
              </div>
              {role && (
                <div className="flex flex-col gap-1">
                  <dt className="type-utility text-muted">{t("role")}</dt>
                  <dd className="text-body text-ink">{t(`roles.${role}`)}</dd>
                </div>
              )}
            </dl>
          </Card>
        </Grid>
      </Stack>
    </Container>
  );
}
