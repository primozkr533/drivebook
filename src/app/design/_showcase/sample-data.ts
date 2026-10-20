import type { CarCardData } from "@/components/signature/car-card";
import type { TicketData } from "@/components/signature/booking-ticket";
import type { WeeklyHours } from "@/components/signature/opening-hours";

// Representative content for the showcase only — real data comes from the DB in later stages.

export const dealer = {
  name: "Avto Novak",
  slug: "novak",
  address: "Tržaška cesta 132, 1000 Ljubljana",
  phone: "+386 1 423 55 80",
  phoneHref: "tel:+38614235580",
  mapsUrl: "https://maps.google.com/?q=Tržaška+cesta+132+Ljubljana",
  privacyUrl: "https://avto-novak.si/zasebnost",
  baseDomain: "drivebook.si",
};

export const hours: WeeklyHours = {
  mon: [["08:00", "12:00"], ["13:00", "18:00"]],
  tue: [["08:00", "12:00"], ["13:00", "18:00"]],
  wed: [["08:00", "12:00"], ["13:00", "18:00"]],
  thu: [["08:00", "12:00"], ["13:00", "19:00"]],
  fri: [["08:00", "16:00"]],
  sat: [["09:00", "12:00"]],
  sun: [],
};

export const cars: CarCardData[] = [
  { id: "k7Qm2xVa", make: "Škoda", model: "Octavia Combi 2.0 TDI Style", year: 2021, priceEur: 21490, avtoNetUrl: "https://www.avto.net/Ads/details.asp?id=20419333", active: true },
  { id: "p3Rt9wLc", make: "Volkswagen", model: "Golf 1.5 eTSI Life", year: 2022, priceEur: 23900, avtoNetUrl: "https://www.avto.net/Ads/details.asp?id=20388120", active: true },
  { id: "b8Nd4sQe", make: "Renault", model: "Clio TCe 90 Evolution", year: 2023, priceEur: 15750, avtoNetUrl: "https://www.avto.net/Ads/details.asp?id=20401557", active: true },
  { id: "h2Jy6uZr", make: "Toyota", model: "Yaris Cross 1.5 Hybrid", year: 2022, priceEur: 24300, avtoNetUrl: "https://www.avto.net/Ads/details.asp?id=20377904", active: true },
  { id: "m5Wf1kPx", make: "Peugeot", model: "308 SW 1.2 PureTech Allure", year: 2020, priceEur: 16990, avtoNetUrl: "https://www.avto.net/Ads/details.asp?id=20311486", active: true },
  { id: "c9Gv3tHn", make: "Kia", model: "Sportage 1.6 T-GDI Hybrid", year: 2023, priceEur: 33400, avtoNetUrl: "https://www.avto.net/Ads/details.asp?id=20422771", active: false },
];

export const ticket: TicketData = {
  reference: "DB-7KQ2-M9",
  kind: "testDrive",
  start: new Date("2026-10-22T12:30:00Z"), // 14:30 Europe/Ljubljana (CEST)
  end: new Date("2026-10-22T13:15:00Z"),
  car: "Škoda Octavia Combi 2.0 TDI Style · 2021",
  customerName: "Maja Kovačič",
  customerPhone: "+386 41 ••• 218",
  phoneVerified: true,
  dealerName: "Avto Novak",
  dealerAddress: "Tržaška cesta 132, Ljubljana",
};

export const deepLink = (id: string) => `https://${dealer.slug}.${dealer.baseDomain}/?car=${id}`;
