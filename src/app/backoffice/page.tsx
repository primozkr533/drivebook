import { SignedInScreen } from "@/components/auth/SignedInScreen";
import { requireBackofficeUser } from "@/server/auth/permissions";

export default async function BackofficeHomePage() {
  const { user } = await requireBackofficeUser();
  return <SignedInScreen surface="backoffice" email={user.email} />;
}
