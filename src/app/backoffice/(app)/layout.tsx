import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { AdminHeader } from "@/components/auth/AdminHeader";
import { Shell } from "@/components/ui";
import { locale, messages, timeZone } from "@/i18n/request";
import { getSurfaceBasePath, requireBackofficeUser } from "@/server/auth/permissions";

export default async function BackofficeAppLayout({ children }: { children: ReactNode }) {
  const { user } = await requireBackofficeUser();
  const [basePath, t] = await Promise.all([getSurfaceBasePath(), getTranslations("auth")]);
  return (
    <Shell header={<AdminHeader surface="backoffice" basePath={basePath} email={user.email} context={t("eyebrowBackoffice")} />}>
      <NextIntlClientProvider locale={locale} timeZone={timeZone} messages={messages}>
        {children}
      </NextIntlClientProvider>
    </Shell>
  );
}
