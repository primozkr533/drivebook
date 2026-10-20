import type { ReactNode } from "react";
import { AdminHeader } from "@/components/auth/AdminHeader";
import { Shell } from "@/components/ui";
import { getSurfaceBasePath, requireDealerUser } from "@/server/auth/permissions";
import { getDealerName } from "@/server/data/dealers";

export default async function DealerAppLayout({ children }: { children: ReactNode }) {
  const { ctx, user } = await requireDealerUser();
  const [basePath, dealerName] = await Promise.all([getSurfaceBasePath(), getDealerName(ctx)]);
  return (
    <Shell header={<AdminHeader surface="dealer" basePath={basePath} email={user.email} context={dealerName ?? ctx.slug} />}>
      {children}
    </Shell>
  );
}
