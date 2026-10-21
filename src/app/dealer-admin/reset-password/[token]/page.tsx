import type { Metadata } from "next";
import { passwordPageTitle, SetPasswordScreen } from "@/components/auth/PasswordScreens";

export async function generateMetadata(): Promise<Metadata> {
  return { title: await passwordPageTitle("reset") };
}

export default async function DealerResetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <SetPasswordScreen surface="dealer" purpose="reset" token={token} />;
}
