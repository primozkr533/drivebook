import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { cars, dealers } from "@/db/schema";

// Rows only: the keys point at no stored file, which is enough for markup checks.
export async function addCarsWithImages(dealerId: string, count: number): Promise<void> {
  await getDb()
    .insert(cars)
    .values(
      Array.from({ length: count }, (_, i) => ({
        dealerId,
        make: "Škoda",
        model: `Octavia ${i + 1}`,
        year: 2020 + (i % 5),
        priceEur: 15000 + i * 1000,
        body: "estate" as const,
        imageKey: `cars/e2e-missing-${i}.webp`,
        sortOrder: i,
      })),
    );
}

export async function setDealerLogoKey(dealerId: string, logoKey: string): Promise<void> {
  await getDb().update(dealers).set({ logoKey }).where(eq(dealers.id, dealerId));
}
