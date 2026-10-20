import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AccountPanel } from "@/components/auth/AccountPanel";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("account"))("title") };
}

export default async function BackofficeAccountPage() {
  return <AccountPanel surface="backoffice" />;
}
