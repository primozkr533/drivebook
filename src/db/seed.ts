import { and, count, eq, sql } from "drizzle-orm";
import { getConfig } from "@/lib/config";
import { ljubljanaNow, slovenianWorkFreeDays } from "@/lib/date";
import holidayNames from "../../messages/sl/holidays.json";
import { DEMO_DEALER_SLUG, DEMO_OLD_SLUG, DEMO_OWNER_EMAIL } from "./demo";
import type { Db } from "./client";
import {
  backofficeUsers,
  bookingRules,
  cars,
  dealerLicenceHistory,
  dealers,
  dealerSlugHistory,
  dealerClosures,
  dealerUsers,
  holidayOverrides,
  openingHours,
  plans,
} from "./schema";

export { DEMO_DEALER_SLUG, DEMO_OLD_SLUG, DEMO_OWNER_EMAIL };

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export const DEMO_CAR_IDS = {
  octavia: "q7Kd2mXv9TzR4bNw",
  tiguan: "Lp3sV8yQe1HcZu6J",
  clio: "bR5nW0tGk2YfA9xM",
  peugeot308: "Hc8uE4jP6sDq1VoT",
} as const;

const LEGACY_DEMO_OWNER_EMAIL = "lastnik@demo.drivebook.localhost";

export const DEFAULT_PLAN_CODE = "standard";
const PLAN_MAX_USERS = 10;
const PLAN_MONTHLY_SMS_QUOTA = 300;
const AVTO_NET_DETAILS = "https://www.avto.net/Ads/details.asp?id=";

const OPENING_HOURS: { isoWeekday: number; opensAt: string; closesAt: string }[] = [
  ...[1, 2, 3, 4, 5].flatMap((isoWeekday) => [
    { isoWeekday, opensAt: "08:00", closesAt: "12:00" },
    { isoWeekday, opensAt: "13:00", closesAt: "18:00" },
  ]),
  { isoWeekday: 6, opensAt: "08:00", closesAt: "12:00" },
];

export const DEMO_EMAIL = "info@demo.drivebook.localhost";
export const DEMO_MAPS_URL = "https://maps.google.com/?q=Dunajska+cesta+100,+1000+Ljubljana";
export const DEMO_SMS_SENDER_NAME = "AvtoDemo";
export const DEMO_SALESPERSON_EMAIL = "prodaja@demo.drivebook.localhost";
export const DEMO_CLOSURE_REASON = "Inventura";
const DEMO_CLOSURE_OFFSET_DAYS = 30;
const DEMO_CLOSURE_LENGTH_DAYS = 2;

function addDays(dateISO: string, days: number): string {
  const d = new Date(`${dateISO}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function runSeed(db: Db): Promise<void> {
  const { seedSuperadminEmail } = getConfig();

  const today = ljubljanaNow().dateISO;
  const validUntil = new Date(`${today}T00:00:00Z`);
  validUntil.setUTCFullYear(validUntil.getUTCFullYear() + 1);
  const licenceValidUntil = validUntil.toISOString().slice(0, 10);

  await db.transaction(async (tx) => {
    const planId = await ensureDefaultPlan(tx);

    await tx
      .insert(backofficeUsers)
      .values({
        email: seedSuperadminEmail.toLowerCase(),
        name: "Super Admin",
        role: "superadmin",
        status: "active",
        passwordHash: null,
      })
      .onConflictDoNothing({ target: backofficeUsers.email });

    const dealerId = await upsertDemoDealer(tx, planId, licenceValidUntil);

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
        validUntil: licenceValidUntil,
        note: "Seed",
      });
    }

    await tx
      .insert(dealerSlugHistory)
      .values({ dealerId, slug: DEMO_OLD_SLUG })
      .onConflictDoNothing({ target: dealerSlugHistory.slug });

    await tx.insert(bookingRules).values({ dealerId }).onConflictDoNothing({ target: bookingRules.dealerId });

    // Only into an empty week: adding single ranges next to edited hours could overlap them.
    const [hours] = await tx.select({ n: count() }).from(openingHours).where(eq(openingHours.dealerId, dealerId));
    if (hours.n === 0) {
      await tx.insert(openingHours).values(OPENING_HOURS.map((range) => ({ dealerId, ...range })));
    }

    const year = Number(today.slice(0, 4));
    await tx
      .insert(holidayOverrides)
      .values(
        [...slovenianWorkFreeDays(year), ...slovenianWorkFreeDays(year + 1)].map((day) => ({
          dealerId,
          date: day.date,
          key: day.key,
          name: holidayNames[day.key as keyof typeof holidayNames],
        })),
      )
      .onConflictDoNothing({ target: [holidayOverrides.dealerId, holidayOverrides.date] });

    const [closures] = await tx
      .select({ n: count() })
      .from(dealerClosures)
      .where(eq(dealerClosures.dealerId, dealerId));
    if (closures.n === 0) {
      await tx.insert(dealerClosures).values({
        dealerId,
        startDate: addDays(today, DEMO_CLOSURE_OFFSET_DAYS),
        endDate: addDays(today, DEMO_CLOSURE_OFFSET_DAYS + DEMO_CLOSURE_LENGTH_DAYS - 1),
        reason: DEMO_CLOSURE_REASON,
      });
    }

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

    // Databases seeded before the owner got its fixed email would otherwise end up with two owners.
    const [owner] = await tx
      .select({ id: dealerUsers.id })
      .from(dealerUsers)
      .where(eq(dealerUsers.email, DEMO_OWNER_EMAIL));
    if (!owner) {
      await tx
        .update(dealerUsers)
        .set({ email: DEMO_OWNER_EMAIL })
        .where(and(eq(dealerUsers.dealerId, dealerId), eq(dealerUsers.email, LEGACY_DEMO_OWNER_EMAIL)));
    }

    await tx
      .insert(dealerUsers)
      .values([
        {
          dealerId,
          email: DEMO_OWNER_EMAIL,
          name: "Mojca Novak",
          role: "owner",
          status: "active",
          passwordHash: null,
        },
        {
          dealerId,
          email: DEMO_SALESPERSON_EMAIL,
          name: "Luka Kovač",
          role: "salesperson",
          status: "active",
          passwordHash: null,
        },
      ])
      .onConflictDoNothing({ target: dealerUsers.email });
  });
}

// Insert only: operators edit the default plan in the backoffice and a restart must not undo that.
async function ensureDefaultPlan(tx: Tx): Promise<string> {
  await tx
    .insert(plans)
    .values({
      code: DEFAULT_PLAN_CODE,
      name: "Standard",
      maxCars: 50,
      maxUsers: PLAN_MAX_USERS,
      monthlySmsQuota: PLAN_MONTHLY_SMS_QUOTA,
      priceEurCents: 4900,
    })
    .onConflictDoNothing({ target: plans.code });
  const [plan] = await tx.select({ id: plans.id }).from(plans).where(eq(plans.code, DEFAULT_PLAN_CODE));
  return plan.id;
}

// Existing demo dealer values are kept so admin edits survive a re-seed; only empty settings are filled.
async function upsertDemoDealer(tx: Tx, planId: string, licenceValidUntil: string): Promise<string> {
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
      email: DEMO_EMAIL,
      primaryColor: "#1F4FD8",
      mapsUrl: DEMO_MAPS_URL,
      privacyUrl: null,
      logoKey: null,
      smsSenderName: DEMO_SMS_SENDER_NAME,
      status: "active",
      planId,
      licenceValidUntil,
    })
    .onConflictDoNothing({ target: dealers.slug });
  await tx
    .update(dealers)
    .set({
      email: sql`coalesce(nullif(${dealers.email}, ''), ${DEMO_EMAIL})`,
      mapsUrl: sql`coalesce(nullif(${dealers.mapsUrl}, ''), ${DEMO_MAPS_URL})`,
      smsSenderName: sql`coalesce(nullif(${dealers.smsSenderName}, ''), ${DEMO_SMS_SENDER_NAME})`,
    })
    .where(
      and(
        eq(dealers.slug, DEMO_DEALER_SLUG),
        sql`(${dealers.email} = '' OR coalesce(${dealers.mapsUrl}, '') = '' OR coalesce(${dealers.smsSenderName}, '') = '')`,
      ),
    );
  const [dealer] = await tx
    .select({ id: dealers.id })
    .from(dealers)
    .where(eq(dealers.slug, DEMO_DEALER_SLUG));
  return dealer.id;
}
