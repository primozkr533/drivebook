import type { Metadata } from "next";
import { LoginScreen, loginTitle } from "@/components/auth/LoginScreen";

export async function generateMetadata(): Promise<Metadata> {
  return { title: await loginTitle("dealer") };
}

export default function DealerLoginPage() {
  return <LoginScreen surface="dealer" />;
}
