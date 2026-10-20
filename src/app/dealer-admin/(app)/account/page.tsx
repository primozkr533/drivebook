import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AccountScreen } from "@/components/auth/AccountScreen";
import { requireDealerUser } from "@/server/auth/permissions";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("account"))("title") };
}

export default async function DealerAccountPage() {
  const { user } = await requireDealerUser();
  return <AccountScreen email={user.email} />;
}
