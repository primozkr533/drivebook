import {
  AppShell,
  Badge,
  Button,
  Card,
  Container,
  CopyButton,
  Field,
  Grid,
  Heading,
  Input,
  Kicker,
  Notice,
  Segmented,
  Text,
  TextLink,
} from "@/components/ui";
import { CarCard, CarImage } from "@/components/signature/car-card";
import { DealerFooter, DealerMasthead, MapLink, PhoneLink } from "@/components/signature/dealer-masthead";
import { WeekHours } from "@/components/signature/week-hours";
import { formatEur } from "@/lib/format";
import { carLabels, cars, dealer, featuredCar, hours } from "./content";

export const mastheadFacts = [
  { label: "Naslov", value: dealer.address },
  { label: "Telefon", value: <PhoneLink phone={dealer.phone} /> },
  { label: "Danes odprto", value: <span className="tabular-nums">08:00–12:00 · 13:00–18:00</span> },
  { label: "Lokacija", value: <MapLink href={dealer.maps} label="Odpri v Google Zemljevidih" /> },
];

/* ── Public dealer page: novak.drivebook.si/?car=k3f9xq2a ───────────────── */

export function PublicDealerScreen() {
  return (
    <div className="bg-ground">
      <DealerMasthead
        name={
          <>
            Avto <em>Novak</em>
          </>
        }
        strap="Testne vožnje in ogledi"
        host={dealer.host}
        monogram={dealer.monogram}
        facts={mastheadFacts}
      />

      <Container className="pt-8 lg:pt-12">
        <Grid layout="aside" className="items-start">
          <div className="flex min-w-0 flex-col gap-section">
            <CarCard
              featured
              car={featuredCar}
              labels={carLabels}
              action={<Button size="lg">Izberi termin za testno vožnjo</Button>}
            />

            <section className="flex flex-col gap-8">
              <div className="flex items-baseline justify-between gap-4 border-t-(length:--rule-heavy) border-rule pt-4">
                <Heading as="h2" size="xl">
                  Vozila <em>na ogled</em>
                </Heading>
                <Kicker>{cars.length + 1} vozil</Kicker>
              </div>
              <Grid layout="thirds" className="gap-y-10">
                {cars.map((car) => (
                  <CarCard key={car.id} car={car} labels={carLabels} priority />
                ))}
              </Grid>
            </section>
          </div>

          <aside className="flex flex-col gap-8 lg:sticky lg:top-6">
            <Card variant="sunken" padding="md" className="flex flex-col gap-3">
              <Kicker tone="brand">Rezervacija termina</Kicker>
              <Heading as="h2" size="lg">
                Izberite vozilo, <em>nato termin.</em>
              </Heading>
              <Text size="sm">
                Tu bo obrazec za rezervacijo: vrsta obiska, prosti termini in potrditev s kodo SMS.
              </Text>
            </Card>

            <Card variant="ruled" padding="sm" className="flex flex-col gap-4">
              <Kicker tone="ink">Delovni čas</Kicker>
              <WeekHours days={hours} closedLabel="Zaprto" todayLabel="Danes" />
              <Text size="xs" tone="muted">
                Zaprto: 31. 10. Dan reformacije · 1. 11. Dan spomina na mrtve
              </Text>
            </Card>
          </aside>
        </Grid>
      </Container>

      <DealerFooter
        privacy={
          <>
            Upravljavec osebnih podatkov: {dealer.legal} · <TextLink href="#">Politika zasebnosti</TextLink>
          </>
        }
        credit="Naročanje omogoča DriveBook"
      />
    </div>
  );
}

/* ── Suspended dealer: header only + call message ──────────────────────── */

export function SuspendedDealerScreen() {
  return (
    <div className="bg-ground pb-10">
      <DealerMasthead
        name={
          <>
            Avto <em>Novak</em>
          </>
        }
        strap="Testne vožnje in ogledi"
        host={dealer.host}
        monogram={dealer.monogram}
        facts={mastheadFacts}
      />
      <Container>
        <Notice tone="caution" label="Naročanje ni na voljo">
          Spletno naročanje trenutno ni na voljo, pokličite{" "}
          <PhoneLink phone={dealer.phone} />.
        </Notice>
      </Container>
    </div>
  );
}

/* ── Dealer admin: app.drivebook.si/vozila ─────────────────────────────── */

const adminRows = [featuredCar, ...cars.slice(0, 4)];

export function AdminCarsScreen() {
  return (
    <AppShell
      surfaceLabel="Trgovec"
      context={dealer.legal}
      nav={[
        { href: "#", label: "Vozila", active: true },
        { href: "#", label: "Nastavitve" },
        { href: "#", label: "Uporabniki" },
        { href: "#", label: "Račun" },
      ]}
      account={
        <>
          <span className="hidden font-semibold text-ink sm:inline">Mojca Novak</span>
          <Badge shape="pill">Lastnica</Badge>
        </>
      }
    >
      <Container className="py-10 lg:py-14">
        <div className="flex flex-col gap-6 pb-8 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-3">
            <Kicker>7 aktivnih · 2 neaktivni</Kicker>
            <Heading as="h1" size="3xl">
              Vozila
            </Heading>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Segmented
              label="Filter vozil"
              items={[
                { href: "#", label: "Aktivna", count: 7, active: true },
                { href: "#", label: "Neaktivna", count: 2 },
                { href: "#", label: "Vsa", count: 9 },
              ]}
            />
            <Button>Dodaj vozilo</Button>
          </div>
        </div>

        <Grid layout="aside" className="items-start">
          <div className="min-w-0 overflow-x-auto border-t-(length:--rule-heavy) border-rule">
            <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-line">
                  {["Vozilo in povezava za stranke", "Letnik", "Cena", "Stanje", ""].map((h, i) => (
                    <th key={i} className="py-3 pr-4 font-utility text-caption font-medium uppercase tracking-utility text-muted">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {adminRows.map((car) => (
                  <tr key={car.id} className="border-b border-line align-middle">
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-3">
                        <CarImage car={car} noPhoto="" priority className="h-12 w-16 shrink-0" />
                        <div className="flex min-w-0 flex-col">
                          <span className="font-semibold text-ink">
                            {car.make} {car.model}
                          </span>
                          <code className="font-utility text-xs whitespace-nowrap text-muted">
                            {dealer.host}/?car={car.id}
                          </code>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 pr-4 tabular-nums">{car.year}</td>
                    <td className="py-3 pr-4 font-semibold whitespace-nowrap tabular-nums text-ink">{formatEur(car.priceEur)}</td>
                    <td className="py-3 pr-4">
                      <Badge tone="positive" dot>
                        Aktivno
                      </Badge>
                    </td>
                    <td className="py-3 text-right">
                      <CopyButton
                        variant="quiet"
                        size="sm"
                        value={`https://${dealer.host}/?car=${car.id}`}
                        label="Kopiraj povezavo"
                        copiedLabel="Kopirano"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Card as="aside" padding="md" className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <Kicker tone="ink">Novo vozilo</Kicker>
              <Text size="sm">Prilepite povezavo do oglasa in poskusili bomo izpolniti podatke.</Text>
            </div>
            <Field label="Oglas na avto.net" htmlFor="adm-url">
              <Input id="adm-url" defaultValue="https://www.avto.net/Ads/details.asp?id=20431190" />
            </Field>
            <Button variant="secondary">Preberi oglas</Button>
            <Notice tone="caution" label="Samodejno izpolnjevanje ni uspelo">
              avto.net ni odgovoril. Podatke vnesite ročno — vozilo lahko shranite brez tega.
            </Notice>
            <Grid layout="halves" gap="tight">
              <Field label="Znamka" htmlFor="adm-make">
                <Input id="adm-make" defaultValue="Toyota" />
              </Field>
              <Field label="Model" htmlFor="adm-model">
                <Input id="adm-model" defaultValue="Yaris Cross" />
              </Field>
              <Field label="Letnik" htmlFor="adm-year">
                <Input id="adm-year" inputMode="numeric" defaultValue="2023" />
              </Field>
              <Field label="Cena" htmlFor="adm-price">
                <Input id="adm-price" inputMode="numeric" suffix="€" defaultValue="24.600" />
              </Field>
            </Grid>
            <Button>Shrani vozilo</Button>
          </Card>
        </Grid>
      </Container>
    </AppShell>
  );
}
