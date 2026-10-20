import type { CarCardData } from "@/components/signature/car-card";
import type { DayHours } from "@/components/signature/week-hours";

/* Showcase-only sample content — real DriveBook copy, static, no backend. */

export const dealer = {
  name: "Avto Novak",
  legal: "Avto Novak d.o.o.",
  slug: "novak",
  host: "novak.drivebook.si",
  address: "Celovška cesta 228, 1000 Ljubljana",
  phone: "01 510 42 80",
  maps: "https://maps.google.com/?q=Celov%C5%A1ka+cesta+228+Ljubljana",
  monogram: "AN",
};

export const hours: DayHours[] = [
  { day: "Pon", ranges: ["08:00–12:00", "13:00–18:00"] },
  { day: "Tor", ranges: ["08:00–12:00", "13:00–18:00"], today: true },
  { day: "Sre", ranges: ["08:00–12:00", "13:00–18:00"] },
  { day: "Čet", ranges: ["08:00–12:00", "13:00–19:00"] },
  { day: "Pet", ranges: ["08:00–12:00", "13:00–17:00"] },
  { day: "Sob", ranges: ["09:00–13:00"] },
  { day: "Ned", ranges: [] },
];

const listing = (id: number) => `https://www.avto.net/Ads/details.asp?id=${id}`;

export const featuredCar: CarCardData = {
  id: "k3f9xq2a",
  make: "Škoda",
  model: "Octavia Combi",
  variant: "2.0 TDI Style DSG · 110 kW · 64.200 km",
  year: 2021,
  priceEur: 21490,
  imageSrc: "/design/cars/estate.svg",
  avtoNetUrl: listing(20417736),
};

export const cars: CarCardData[] = [
  { id: "p7m2wd8c", make: "Volkswagen", model: "Golf", variant: "1.5 eTSI Life", year: 2022, priceEur: 23900, imageSrc: "/design/cars/hatch.svg", avtoNetUrl: listing(20398112) },
  { id: "t4h8nz1r", make: "Volkswagen", model: "Tiguan", variant: "2.0 TDI 4Motion Elegance", year: 2020, priceEur: 27450, imageSrc: "/design/cars/suv.svg", avtoNetUrl: listing(20411580) },
  { id: "b9q3ls6e", make: "BMW", model: "Serija 3: 320d", variant: "Sport Line, avtomatski", year: 2019, priceEur: 24990, imageSrc: "/design/cars/sedan.svg", avtoNetUrl: listing(20376045) },
  { id: "c2v6kf0y", make: "Renault", model: "Clio", variant: "1.0 TCe Evolution", year: 2023, priceEur: 15750, avtoNetUrl: listing(20422901) },
  { id: "d5r1jm4u", make: "Dacia", model: "Duster", variant: "1.3 TCe Journey", year: 2024, priceEur: 19290, imageSrc: "/design/cars/suv.svg", avtoNetUrl: listing(20425377) },
  { id: "f8w0ga7s", make: "Peugeot", model: "508 SW", variant: "1.5 BlueHDi Allure", year: 2021, priceEur: 22300, imageSrc: "/design/cars/estate.svg", avtoNetUrl: listing(20401264) },
];

export const carLabels = {
  viewListing: "Oglej si oglas na avto.net",
  featured: "Izbrano vozilo",
  noPhoto: "Fotografija ni na voljo",
  year: "Letnik",
  price: "Cena",
};
