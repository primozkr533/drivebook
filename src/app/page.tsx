import { redirect } from "next/navigation";

// Phase 1 replaces this with host-based routing (dealer page / app. / admin.).
export default function Home() {
  redirect("/design");
}
