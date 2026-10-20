/**
 * Static specimen content for /design. Real product data, no backend.
 * Swatch hex values mirror src/styles/tokens.css for labelling only —
 * the swatches themselves render from the CSS variables.
 */
import type { Car, DayHours, DriveTicketData } from "@/components/signature";

export const swatches = {
  neutrals: [
    { token: "--ground", name: "Ground", role: "Podlaga strani", light: "#F2F1EE", dark: "#13110F" },
    { token: "--surface", name: "Surface", role: "Kartice, polja", light: "#FBFAF8", dark: "#1C1A17" },
    { token: "--surface-2", name: "Surface 2", role: "Vdolbine, steze", light: "#E8E6E2", dark: "#0C0B0A" },
    { token: "--line", name: "Line", role: "Lasne črte", light: "#D8D4CE", dark: "#33302B" },
    { token: "--muted", name: "Muted", role: "Napisi, namigi", light: "#6F6862", dark: "#8F877E" },
    { token: "--ink-2", name: "Ink 2", role: "Sekundarno besedilo", light: "#3B3631", dark: "#CEC8BF" },
    { token: "--ink", name: "Ink", role: "Besedilo, robovi", light: "#17140F", dark: "#F2EFEA" },
  ],
  signal: [
    { token: "--signal", name: "Signal", role: "Edina glasna poteza", light: "#FF4F0F", dark: "#FF5C1F" },
    { token: "--signal-ink", name: "Signal ink", role: "Signalno besedilo", light: "#B83A06", dark: "#FF8A55" },
    { token: "--signal-wash", name: "Signal wash", role: "Obarvana podlaga", light: "#FFE2D4", dark: "#3A1B0D" },
  ],
  status: [
    { token: "--ok", name: "OK", role: "Potrjeno, preverjeno", light: "#1E6B47", dark: "#5CC394" },
    { token: "--warn", name: "Warn", role: "Čaka, opozorilo", light: "#8A5D00", dark: "#E3B341" },
    { token: "--danger", name: "Danger", role: "Ni prišel, napaka", light: "#A3123A", dark: "#FF6B8B" },
  ],
};

export const typeScale = [
  { token: "mega", spec: "Archivo 125% · 800 · 36–88", sample: "Testna vožnja", cls: "type-display text-mega uppercase" },
  { token: "d1", spec: "Archivo 125% · 800 · 36–60", sample: "Avto Novak", cls: "type-display text-d1 uppercase" },
  { token: "h1", spec: "Archivo 125% · 800 · 28–40", sample: "Delovni čas in zaprtja", cls: "type-display text-h1" },
  { token: "h2", spec: "Archivo 100% · 750 · 24", sample: "Pravila naročanja", cls: "text-h2 font-[750]" },
  { token: "h3", spec: "Archivo 100% · 650 · 18", sample: "Škoda Octavia Combi", cls: "text-h3 font-[650]" },
  { token: "lead", spec: "Archivo 100% · 420 · 19", sample: "Stranke potrdijo telefon, prejmejo opomnik in pridejo.", cls: "text-lead text-ink-2" },
  { token: "body", spec: "Archivo 100% · 420 · 16", sample: "Minimalni čas vnaprej je 2 uri, obdobje naročanja 14 dni, razmik med termini 15 minut.", cls: "text-body text-ink-2" },
  { token: "small", spec: "Archivo 100% · 420 · 14", sample: "Odpoved ali sprememba termina je mogoča do 2 uri pred začetkom.", cls: "text-small text-ink-2" },
  { token: "micro", spec: "JetBrains Mono · 500 · 11 · +0.14em", sample: "Koda rezervacije · DB-7K4Q-M2", cls: "type-utility text-ink" },
];

export const spacing = [
  ["1", 4],
  ["2", 8],
  ["3", 12],
  ["4", 16],
  ["5", 24],
  ["6", 32],
  ["7", 48],
  ["8", 64],
  ["9", 96],
] as const;

export const weekHours: DayHours[] = [
  { short: "Pon", ranges: [["08:00", "12:00"], ["13:00", "18:00"]] },
  { short: "Tor", ranges: [["08:00", "12:00"], ["13:00", "18:00"]] },
  { short: "Sre", ranges: [["08:00", "12:00"], ["13:00", "18:00"]] },
  { short: "Čet", ranges: [["08:00", "12:00"], ["13:00", "19:00"]] },
  { short: "Pet", ranges: [["08:00", "16:00"]] },
  { short: "Sob", ranges: [["09:00", "12:00"]] },
  { short: "Ned", ranges: [] },
];

export const upcomingClosures = [
  { date: "sob 31. 10.", name: "Dan reformacije", kind: "Praznik" },
  { date: "ned 1. 11.", name: "Dan spomina na mrtve", kind: "Praznik" },
  { date: "24. 12. – 2. 1.", name: "Letni inventurni dopust", kind: "Zaprto" },
];

export const ticket: DriveTicketData = {
  kind: "Testna vožnja",
  dealer: "Avto Novak",
  car: "Škoda Octavia Combi",
  carMeta: "2.0 TDI Style · 2021 · 18.990 €",
  weekday: "Četrtek",
  day: "22",
  month: "Oktober 2026",
  start: "14:30",
  end: "15:15",
  customer: "Maja Kovač",
  phone: "+386 41 ••• 218",
  phoneVerified: true,
  code: "DB-7K4Q-M2",
  cutoffNote: "Spremeni ali odpovej do čet 22. 10. ob 12:30",
  reminderNote: "SMS opomnik: sre 21. 10. ob 18:00",
  status: "confirmed",
};

export const cars: Car[] = [
  {
    id: "k7Qm2x",
    make: "Škoda",
    model: "Octavia Combi",
    trim: "2.0 TDI Style DSG",
    year: 2021,
    priceEur: 18990,
    body: "estate",
    avtoNetUrl: "https://www.avto.net/Ads/details.asp?id=20311458",
  },
  {
    id: "p3Rw9d",
    make: "Volkswagen",
    model: "Golf",
    trim: "1.5 eTSI Life",
    year: 2022,
    priceEur: 21450,
    body: "sedan",
    avtoNetUrl: "https://www.avto.net/Ads/details.asp?id=20298721",
  },
  {
    id: "z8Ln4c",
    make: "Dacia",
    model: "Duster",
    trim: "1.3 TCe 4x4 Prestige",
    year: 2020,
    priceEur: 15700,
    body: "suv",
    avtoNetUrl: "https://www.avto.net/Ads/details.asp?id=20277305",
  },
  {
    id: "m2Hs6t",
    make: "Renault",
    model: "Clio",
    trim: "1.0 TCe Zen",
    year: 2019,
    priceEur: 10900,
    body: "sedan",
    avtoNetUrl: "https://www.avto.net/Ads/details.asp?id=20244190",
  },
];

export const dealer = {
  name: "Avto Novak",
  legal: "Avto Novak d.o.o.",
  slug: "novak",
  address: "Celovška cesta 280, 1000 Ljubljana",
  phone: "01 234 56 78",
  phoneHref: "tel:+38612345678",
  maps: "https://maps.google.com/?q=Celovška+cesta+280+Ljubljana",
};

export const brandDemos = [
  { name: "Avto Novak", slug: "novak", hex: "#FF4F0F" },
  { name: "Avtohiša Kranj", slug: "avtohisa-kranj", hex: "#0E5A47" },
  { name: "Car Center Koper", slug: "cc-koper", hex: "#F2C200" },
  { name: "Mobil Ptuj", slug: "mobil-ptuj", hex: "#1F3FBF" },
];
