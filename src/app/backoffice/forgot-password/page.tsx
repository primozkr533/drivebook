import type { Metadata } from "next";
import { ForgotPasswordScreen, passwordPageTitle } from "@/components/auth/PasswordScreens";

export async function generateMetadata(): Promise<Metadata> {
  return { title: await passwordPageTitle("forgot") };
}

export default function BackofficeForgotPasswordPage() {
  return <ForgotPasswordScreen surface="backoffice" />;
}
