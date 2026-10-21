import { redirect } from "next/navigation";
import { getSurfaceBasePath, requireBackofficeUser } from "@/server/auth/permissions";

export default async function BackofficeHomePage() {
  await requireBackofficeUser();
  redirect(`${await getSurfaceBasePath()}/dealers`);
}
