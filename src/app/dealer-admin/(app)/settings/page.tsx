import { redirect } from "next/navigation";
import { getSurfaceBasePath } from "@/server/auth/permissions";
import { AccessDenied, requireOwnerPage } from "../owner-gate";

export default async function SettingsHomePage() {
  const gate = await requireOwnerPage();
  if (!gate.ok) return <AccessDenied />;
  redirect(`${await getSurfaceBasePath()}/settings/dealer`);
}
