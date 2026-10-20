import { eq } from "drizzle-orm";
import { getConfig } from "@/lib/config";
import { DEMO_DEALER_SLUG, DEMO_OLD_SLUG } from "./demo";
import type { Db } from "./client";
import {
  backofficeUsers,
  bookingRules,
  cars,
  dealerLicenceHistory,
  dealers,
  dealerSlugHistory,
  dealerUsers,
  openingHours,
  plans,
} from "./schema";

export { DEMO_DEALER_SLUG, DEMO_OLD_SLUG };

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export const DEMO_CAR_IDS = {
  octavia: "q7Kd2mXv9TzR4bNw",
  tiguan: "Lp3sV8yQe1HcZu6J",
  clio: "bR5nW0tGk2YfA9xM",
  peugeot308: "Hc8uE4jP6sDq1VoT",
} as const;

const PLAN_CODE = "standard";
const AVTO_NET_DETAILS = "https://www.avto.net/Ads/details.asp?id=";

const OPENING_HOURS: { isoWeekday: number; opensAt: string; closesAt: string }[] = [
  ...[1, 2, 3, 4, 5].flatMap((isoWeekday) => [
    { isoWeekday, opensAt: "08:00", closesAt: "12:00" },
    { isoWeekday, opensAt: "13:00", closesAt: "18:00" },
  ]),
  { isoWeekday: 6, opensAt: "08:00", closesAt: "12:00" },
];

export async function runSeed(db: Db): Promise<void> {
  const { seedSuperadminEmail } = getConfig();

  await db.transaction(async (tx) => {
    const planId = await upsertPlan(tx);

    await tx
      .insert(backofficeUsers)
      .values({ email: seedSuperadminEmail, name: "Super Admin", role: "superadmin", passwordHash: null })
      .onConflictDoNothing({ target: backofficeUsers.email });

    const dealerId = await upsertDemoDealer(tx, planId);

    const [licence] = await tx
      .select({ id: dealerLicenceHistory.id })
      .from(dealerLicenceHistory)
      .where(eq(dealerLicenceHistory.dealerId, dealerId))
      .limit(1);
    if (!licence) {
      await tx.insert(dealerLicenceHistory).values({
        dealerId,
        planId,
        validFrom: new Date(),
        validTo: null,
        note: "Seed",
      });
    }

    await tx
      .insert(dealerSlugHistory)
      .values({ dealerId, slug: DEMO_OLD_SLUG })
      .onConflictDoNothing({ target: dealerSlugHistory.slug });

    await tx.insert(bookingRules).values({ dealerId }).onConflictDoNothing({ target: bookingRules.dealerId });

    await tx
      .insert(openingHours)
      .values(OPENING_HOURS.map((hours) => ({ dealerId, ...hours })))
      .onConflictDoNothing({
        target: [openingHours.dealerId, openingHours.isoWeekday, openingHours.opensAt],
      });

    // No target: a car may collide on its fixed id or on (dealer_id, avto_net_url).
    await tx
      .insert(cars)
      .values([
        {
          id: DEMO_CAR_IDS.octavia,
          dealerId,
          make: "Škoda",
          model: "Octavia Combi",
          trim: "2.0 TDI Style",
          year: 2021,
          priceEur: 18900,
          body: "estate",
          avtoNetUrl: `${AVTO_NET_DETAILS}10000001`,
          imageKey: null,
          active: true,
          sortOrder: 0,
        },
        {
          id: DEMO_CAR_IDS.tiguan,
          dealerId,
          make: "Volkswagen",
          model: "Tiguan",
          trim: "1.5 TSI Life",
          year: 2022,
          priceEur: 27500,
          body: "suv",
          avtoNetUrl: `${AVTO_NET_DETAILS}10000002`,
          imageKey: null,
          active: true,
          sortOrder: 1,
        },
        {
          id: DEMO_CAR_IDS.clio,
          dealerId,
          make: "Renault",
          model: "Clio",
          trim: "TCe 90 Evolution",
          year: 2023,
          priceEur: 15400,
          body: "sedan",
          avtoNetUrl: `${AVTO_NET_DETAILS}10000003`,
          imageKey: null,
          active: true,
          sortOrder: 2,
        },
        {
          id: DEMO_CAR_IDS.peugeot308,
          dealerId,
          make: "Peugeot",
          model: "308",
          trim: "1.2 PureTech Allure",
          year: 2020,
          priceEur: 13900,
          body: "sedan",
          avtoNetUrl: `${AVTO_NET_DETAILS}10000004`,
          imageKey: null,
          active: false,
          sortOrder: 3,
        },
      ])
      .onConflictDoNothing();

    // The unique key is the expression (dealer_id, lower(email)), which a column target cannot name.
    await tx
      .insert(dealerUsers)
      .values([
        {
          dealerId,
          email: "lastnik@demo.drivebook.localhost",
          name: "Mojca Novak",
          role: "owner",
          passwordHash: null,
        },
        {
          dealerId,
          email: "prodaja@demo.drivebook.localhost",
          name: "Luka Kovač",
          role: "salesperson",
          passwordHash: null,
        },
      ])
      .onConflictDoNothing();
  });
}

async function upsertPlan(tx: Tx): Promise<string> {
  const [plan] = await tx
    .insert(plans)
    .values({
      code: PLAN_CODE,
      name: "Standard",
      maxCars: 50,
      maxUsers: 10,
      smsIncluded: 300,
      priceEurCents: 4900,
    })
    .onConflictDoUpdate({
      target: plans.code,
      set: { name: "Standard", maxCars: 50, maxUsers: 10, smsIncluded: 300, priceEurCents: 4900 },
    })
    .returning({ id: plans.id });
  return plan.id;
}

// Existing demo dealer rows are left as-is so edits made in the admin survive a re-seed.
async function upsertDemoDealer(tx: Tx, planId: string): Promise<string> {
  await tx
    .insert(dealers)
    .values({
      slug: DEMO_DEALER_SLUG,
      name: "Avtohiša Demo",
      legalName: "Avtohiša Demo d.o.o.",
      addressLine: "Dunajska cesta 100",
      postalCode: "1000",
      city: "Ljubljana",
      phone: "+386 1 234 56 78",
      email: "info@demo.drivebook.localhost",
      primaryColor: "#1F4FD8",
      mapsUrl: null,
      privacyUrl: null,
      logoKey: null,
      status: "active",
      planId,
    })
    .onConflictDoNothing({ target: dealers.slug });
  const [dealer] = await tx
    .select({ id: dealers.id })
    .from(dealers)
    .where(eq(dealers.slug, DEMO_DEALER_SLUG));
  return dealer.id;
}
