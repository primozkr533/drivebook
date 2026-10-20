import { SignedInScreen } from "@/components/auth/SignedInScreen";
import { requireDealerUser } from "@/server/auth/permissions";

export default async function DealerHomePage() {
  const { user } = await requireDealerUser();
  return <SignedInScreen surface="dealer" email={user.email} />;
}
