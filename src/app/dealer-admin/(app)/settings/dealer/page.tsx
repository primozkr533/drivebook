import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AccessDenied, requireOwnerPage } from "../../owner-gate";
import { SettingsStub } from "../SettingsStub";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("settings"))("sections.dealer") };
}

export default async function SettingsDealerPage() {
  const gate = await requireOwnerPage();
  if (!gate.ok) return <AccessDenied />;
  return <SettingsStub section="dealer" />;
}
