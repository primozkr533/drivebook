import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AccessDenied, requireOwnerPage } from "../../owner-gate";
import { SettingsStub } from "../SettingsStub";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("settings"))("sections.booking") };
}

export default async function SettingsBookingPage() {
  const gate = await requireOwnerPage();
  if (!gate.ok) return <AccessDenied />;
  return <SettingsStub section="booking" />;
}
