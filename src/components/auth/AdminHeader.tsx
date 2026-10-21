import { getTranslations } from "next-intl/server";
import { Text } from "@/components/ui";
import type { AuthSurface } from "@/server/auth/session";
import { ActiveNavHeader } from "./ActiveNavHeader";
import { LogoutButton } from "./LogoutButton";

export async function AdminHeader({
  surface,
  basePath,
  email,
  context,
  role,
}: {
  surface: AuthSurface;
  basePath: string;
  email: string;
  context: string;
  role?: string;
}) {
  const [t, tBackoffice, tSettings] = await Promise.all([
    getTranslations("account"),
    getTranslations("backoffice"),
    getTranslations("settings"),
  ]);
  const nav = [
    ...(surface === "backoffice"
      ? [
          { label: tBackoffice("dealers.nav"), href: `${basePath}/dealers` },
          { label: tBackoffice("plans.nav"), href: `${basePath}/plans` },
          { label: tBackoffice("users.nav"), href: `${basePath}/users` },
        ]
      : []),
    ...(surface === "dealer" && role === "owner"
      ? [
          { label: tSettings("nav"), href: `${basePath}/settings` },
          { label: tSettings("usersNav"), href: `${basePath}/users` },
        ]
      : []),
    { label: t("navAccount"), href: `${basePath}/account` },
  ];
  return (
    <ActiveNavHeader
      context={
        <Text as="span" size="small" tone="ink" className="font-[650]" data-testid="header-context">
          {context}
        </Text>
      }
      nav={nav}
      actions={
        <>
          <Text as="span" size="small" className="hidden max-w-64 truncate md:inline" data-testid="header-email">
            {email}
          </Text>
          <LogoutButton surface={surface} />
        </>
      }
      menu={{
        label: t("menu"),
        footer: (
          <>
            <Text as="span" size="small" tone="ink" className="font-[650]">
              {context}
            </Text>
            <Text as="span" size="small" className="truncate">
              {email}
            </Text>
          </>
        ),
      }}
    />
  );
}
