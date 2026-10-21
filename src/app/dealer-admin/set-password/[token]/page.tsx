import type { Metadata } from "next";
import { passwordPageTitle, SetPasswordScreen } from "@/components/auth/PasswordScreens";

export async function generateMetadata(): Promise<Metadata> {
  return { title: await passwordPageTitle("invite") };
}

export default async function DealerSetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <SetPasswordScreen surface="dealer" purpose="invite" token={token} />;
}
