import { redirect } from "next/navigation";
import { getSurfaceBasePath, requireDealerUser } from "@/server/auth/permissions";

export default async function DealerHomePage() {
  await requireDealerUser();
  redirect(`${await getSurfaceBasePath()}/account`);
}
