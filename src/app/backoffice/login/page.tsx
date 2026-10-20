import type { Metadata } from "next";
import { LoginScreen, loginTitle } from "@/components/auth/LoginScreen";

export async function generateMetadata(): Promise<Metadata> {
  return { title: await loginTitle("backoffice") };
}

export default function BackofficeLoginPage() {
  return <LoginScreen surface="backoffice" />;
}
