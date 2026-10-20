import { and, eq } from "drizzle-orm";
import { DEMO_OWNER_EMAIL } from "@/db/demo";
import { dealers, dealerUsers } from "@/db/schema";
import { db } from "@/server/data/db";
import { writeAuthAudit } from "./login";
import { createSession } from "./session";

export type TestLoginResult = { token: string; email: string; role: "owner"; dealerSlug: string };

// Gate-only: signs in as the seeded demo Owner without a password. Callers must check FARM_TEST_AUTH.
export async function testLoginDemoOwner(meta: { ip: string; userAgent?: string | null }): Promise<TestLoginResult | null> {
  const [owner] = await db()
    .select({ id: dealerUsers.id, email: dealerUsers.email, dealerId: dealers.id, dealerSlug: dealers.slug })
    .from(dealerUsers)
    .innerJoin(dealers, eq(dealers.id, dealerUsers.dealerId))
    .where(
      and(
        eq(dealerUsers.email, DEMO_OWNER_EMAIL),
        eq(dealerUsers.role, "owner"),
        eq(dealerUsers.status, "active"),
      ),
    )
    .limit(1);
  if (!owner) return null;

  const token = await createSession("dealer", owner.id, meta);
  await writeAuthAudit({
    surface: "dealer",
    action: "auth.login.success",
    actorId: owner.id,
    dealerId: owner.dealerId,
    email: owner.email,
    ip: meta.ip,
    reason: "test_login",
  });
  return { token, email: owner.email, role: "owner", dealerSlug: owner.dealerSlug };
}
