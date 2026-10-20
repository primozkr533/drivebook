import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AccountScreen } from "@/components/auth/AccountScreen";
import { requireBackofficeUser } from "@/server/auth/permissions";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("account"))("title") };
}

export default async function BackofficeAccountPage() {
  const { user } = await requireBackofficeUser();
  return <AccountScreen email={user.email} />;
}
