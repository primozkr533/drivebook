import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getOpeningHours } from "@/server/data/settings-hours";
import { AccessDenied, requireOwnerPage } from "../../owner-gate";
import { HoursEditor } from "./HoursEditor";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("settings"))("sections.hours") };
}

export default async function SettingsHoursPage() {
  const gate = await requireOwnerPage();
  if (!gate.ok) return <AccessDenied />;
  const week = await getOpeningHours(gate.ctx);
  return <HoursEditor initial={week} />;
}
