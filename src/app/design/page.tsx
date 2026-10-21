import type { Metadata } from "next";
import type { ReactNode } from "react";
import {
  AppHeader,
  Arrow,
  Badge,
  Button,
  ButtonLink,
  Card,
  CardHeader,
  Container,
  Eyebrow,
  Grid,
  Heading,
  Input,
  PageHeader,
  Pill,
  SectionMark,
  Select,
  Shell,
  Stack,
  Stat,
  Switch,
  Text,
} from "@/components/ui";
import { CarCard, DriveTicket, HoursStrip, Plate } from "@/components/signature";
import { brandStyle, contrast, readableInk } from "@/lib/color";
import { ThemeToggle } from "./ThemeToggle";
import { brandDemos, cars, dealer, spacing, swatches, ticket, typeScale, upcomingClosures, weekHours } from "./content";

export const metadata: Metadata = { title: "Design · DriveBook" };
export const dynamic = "force-static";

const nav = [
  { label: "Barve", href: "#barve" },
  { label: "Tipografija", href: "#tipografija" },
  { label: "Oblike", href: "#oblike" },
  { label: "Komponente", href: "#komponente" },
  { label: "Podpis", href: "#podpis" },
  { label: "Zaslon", href: "#zaslon" },
];

function Section({ id, index, title, intro, children }: { id: string; index: string; title: string; intro?: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-[calc(var(--header-h)+1rem)] border-t border-line-strong py-14 md:py-20">
      <Container>
        <div className="mb-10 grid gap-6 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <SectionMark index={index}>{title}</SectionMark>
          </div>
          {intro && (
            <Text size="lead" className="max-w-2xl lg:col-span-8">
              {intro}
            </Text>
          )}
        </div>
        {children}
      </Container>
    </section>
  );
}

function Swatch({ token, name, role, light, dark }: { token: string; name: string; role: string; light: string; dark: string }) {
  return (
    <div className="flex flex-col bg-surface shadow-[inset_0_0_0_1px_var(--line)]">
      <div className="h-24 shadow-[inset_0_-1px_0_var(--line)]" style={{ background: `var(${token})` }} />
      <div className="flex flex-col gap-1 p-3">
        <span className="text-small font-[650] text-ink">{name}</span>
        <span className="text-small text-muted">{role}</span>
        <code className="mt-1 font-mono text-caption text-ink-2">{token}</code>
        <span className="flex flex-col font-mono text-caption tabular text-muted">
          <span>svetla {light}</span>
          <span>temna {dark}</span>
        </span>
      </div>
    </div>
  );
}

export default function DesignPage() {
  const [selected, ...rest] = cars;

  return (
    <Shell
      header={
        <AppHeader
          context={<Eyebrow tone="ink">Design foundation · v1</Eyebrow>}
          nav={nav}
          actions={<ThemeToggle />}
          menu={{ label: "Meni" }}
        />
      }
    >
      {/* 00 — Masthead */}
      <Container className="pb-14 pt-12 md:pb-20 md:pt-20">
        <div className="grid gap-10 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-8">
            <Eyebrow tone="signal">DriveBook · Signal &amp; Tarmac</Eyebrow>
            <Heading size="mega" className="mt-5">
              Termin, ki
              <br />
              <span className="relative inline-block">
                drži.
                <span aria-hidden className="absolute -bottom-1 left-0 h-[0.12em] w-full bg-signal" />
              </span>
            </Heading>
          </div>
          <div className="flex flex-col gap-6 lg:col-span-4">
            <Text size="lead">
              Cestna infrastruktura kot vizualni jezik: asfaltno sive nevtralne barve, en sam signalno oranžen poudarek,
              razširjene verzalke, lasne črte in prirezani vogali registrske tablice.
            </Text>
            <div className="flex flex-wrap items-center gap-3">
              <Plate>novak</Plate>
              <Plate size="sm">DB-7K4Q-M2</Plate>
            </div>
          </div>
        </div>
        <dl className="mt-14 grid grid-cols-2 gap-px bg-line-strong shadow-[0_0_0_1px_var(--line-strong)] md:grid-cols-4">
          {[
            ["Display", "Archivo Expanded 800"],
            ["Body", "Archivo 420 / 650"],
            ["Utility", "JetBrains Mono, verzalke"],
            ["Mreža", "4 px · max 1248 px"],
          ].map(([k, v]) => (
            <div key={k} className="flex flex-col gap-2 bg-ground p-4 md:p-5">
              <dt className="type-utility text-muted">{k}</dt>
              <dd className="text-body font-[650] text-ink">{v}</dd>
            </div>
          ))}
        </dl>
      </Container>

      {/* 01 — Palette */}
      <Section
        id="barve"
        index="01"
        title="Barve"
        intro="Nevtralne barve so asfalt, rahlo potegnjen proti toplemu odtenku signala — izbrane, ne privzete. Glasnost porabimo na enem mestu: Signal. Statusne barve so utišane, da mu nikoli ne tekmujejo."
      >
        <Stack gap={8}>
          <div>
            <Eyebrow className="mb-3 block">Nevtralne · asfalt</Eyebrow>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
              {swatches.neutrals.map((s) => (
                <Swatch key={s.token} {...s} />
              ))}
            </div>
          </div>
          <Grid cols={2} from="lg" gap="lg">
            <div>
              <Eyebrow className="mb-3 block">Signal · ena poteza</Eyebrow>
              <div className="grid grid-cols-3 gap-3">
                {swatches.signal.map((s) => (
                  <Swatch key={s.token} {...s} />
                ))}
              </div>
            </div>
            <div>
              <Eyebrow className="mb-3 block">Status</Eyebrow>
              <div className="grid grid-cols-3 gap-3">
                {swatches.status.map((s) => (
                  <Swatch key={s.token} {...s} />
                ))}
              </div>
            </div>
          </Grid>
          <Card tone="sunken" pad="md" className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div className="max-w-xl">
              <Heading size="h3">Barva avtohiše — reža --brand</Heading>
              <Text size="small" className="mt-1">
                Javna stran vsake avtohiše prevzame njeno primarno barvo. Barvo besedila na gumbu izračunamo (WCAG kontrast),
                nikoli je ne izbira uporabnik.
              </Text>
            </div>
            <div className="flex flex-wrap gap-3">
              {brandDemos.map((b) => (
                <div key={b.slug} style={brandStyle(b.hex)} className="flex flex-col gap-1.5">
                  <Button variant="brand" size="sm">
                    {b.name}
                  </Button>
                  <span className="font-mono text-micro tabular text-muted">
                    {b.hex} · {contrast(b.hex, readableInk(b.hex)).toFixed(1)}:1
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </Stack>
      </Section>

      {/* 02 — Type */}
      <Section
        id="tipografija"
        index="02"
        title="Tipografija"
        intro="Ena družina, dva registra: Archivo razširjen na 125 % za samozavestne naslove, običajne širine za branje. Mono verzalke za oznake, kode in časovne podatke. Display je začimba — en na zaslon."
      >
        <ul className="flex flex-col">
          {typeScale.map((t) => (
            <li key={t.token} className="grid gap-2 border-t border-line py-5 md:grid-cols-12 md:items-baseline md:gap-6">
              <div className="flex gap-3 md:col-span-3 md:flex-col md:gap-1">
                <span className="type-utility text-signal-ink">{t.token}</span>
                <span className="font-mono text-caption text-muted">{t.spec}</span>
              </div>
              <p className={`${t.cls} text-ink md:col-span-9`}>{t.sample}</p>
            </li>
          ))}
        </ul>
      </Section>

      {/* 03 — Space, shape, depth, motion */}
      <Section
        id="oblike"
        index="03"
        title="Prostor, oblike, gibanje"
        intro="Ostri pravokotniki na lasni črti. Prirezan vogal (chamfer) je podpis — samo za izpostavljene trenutke. Sence so trde in zamaknjene, kot odtis; gibanje je kratko in upošteva prefers-reduced-motion."
      >
        <Grid cols={12} from="lg" gap="lg">
          <div className="lg:col-span-5">
            <Eyebrow className="mb-4 block">Razmiki · 4 px mreža</Eyebrow>
            <ul className="flex flex-col gap-2">
              {spacing.map(([k, px]) => (
                <li key={k} className="grid grid-cols-[4.5rem_1fr_3rem] items-center gap-3">
                  <code className="font-mono text-caption text-ink-2">--space-{k}</code>
                  <span className="h-3 bg-ink" style={{ width: `var(--space-${k})` }} />
                  <span className="text-right font-mono text-caption tabular text-muted">{px}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:col-span-7">
            {[
              { label: "--radius-sharp", node: <div className="h-20 bg-surface shadow-[inset_0_0_0_2px_var(--ink)]" /> },
              { label: "--radius-soft", node: <div className="h-20 rounded-soft bg-surface shadow-[inset_0_0_0_2px_var(--ink)]" /> },
              { label: "--radius-pill", node: <div className="h-20 rounded-pill bg-surface shadow-[inset_0_0_0_2px_var(--ink)]" /> },
              { label: "--cut", node: <div className="cut-tr h-20 bg-ink" /> },
              { label: "--cut-lg", node: <div className="cut-tr cut-lg h-20 bg-signal" /> },
              { label: "lane-rule", node: <div className="flex h-20 items-center bg-surface-2 px-3"><div className="lane-rule w-full" /></div> },
              { label: "--shadow-hard", node: <div className="h-20 bg-surface shadow-hard shadow-[inset_0_0_0_1px_var(--ink)]" /> },
              { label: "--shadow-hard-signal", node: <div className="h-20 bg-surface shadow-hard-signal" /> },
              { label: "--shadow-float", node: <div className="h-20 bg-surface shadow-float" /> },
            ].map((s) => (
              <div key={s.label} className="flex flex-col gap-2">
                {s.node}
                <code className="font-mono text-caption text-ink-2">{s.label}</code>
              </div>
            ))}
            <div className="col-span-full flex flex-wrap gap-x-6 gap-y-2 border-t border-line pt-4 font-mono text-caption text-ink-2">
              <span>--dur-fast 120ms</span>
              <span>--dur-base 220ms</span>
              <span>--dur-reveal 640ms</span>
              <span>--ease-out (.2,.8,.2,1)</span>
              <span>--ease-snap (.5,0,.1,1)</span>
            </div>
          </div>
        </Grid>
      </Section>

      {/* 04 — Primitives */}
      <Section
        id="komponente"
        index="04"
        title="Komponente"
        intro="Primitivi, iz katerih se sestavi vsak zaslon — nadzorna plošča avtohiše, backoffice in javna stran. Novi deljeni gradniki jih sestavljajo, nikoli ne preoblikujejo."
      >
        <Stack gap={8}>
          <Grid cols={2} from="lg" gap="md">
            <Card>
              <CardHeader title="Gumbi" meta={<Eyebrow>Button · ButtonLink</Eyebrow>} />
              <Stack gap={6}>
                <div className="flex flex-wrap items-center gap-3">
                  <Button trailing={<Arrow />}>Shrani pravila</Button>
                  <Button variant="secondary">Dodaj vozilo</Button>
                  <Button variant="quiet">Prekliči</Button>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Button size="lg" trailing={<Arrow />}>
                    Rezerviraj testno vožnjo
                  </Button>
                  <Button size="sm" variant="secondary">
                    Ponovno pošlji vabilo
                  </Button>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Button variant="danger" size="sm">
                    Deaktiviraj uporabnika
                  </Button>
                  <Button disabled size="sm">
                    Doseženo največ uporabnikov
                  </Button>
                  <ButtonLink href="#zaslon" variant="quiet" size="sm">
                    Odpri javno stran
                  </ButtonLink>
                </div>
              </Stack>
            </Card>

            <Card>
              <CardHeader title="Oznake in filtri" meta={<Eyebrow>Badge · Pill</Eyebrow>} />
              <Stack gap={6}>
                <div className="flex flex-wrap gap-2">
                  <Badge tone="ok">Aktiven</Badge>
                  <Badge tone="danger">Suspendiran</Badge>
                  <Badge tone="warn">Vabilo poslano</Badge>
                  <Badge tone="signal">Lastnik</Badge>
                  <Badge tone="neutral">Prodajalec</Badge>
                  <Badge tone="ink" dot={false}>
                    2FA
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Pill active count={12}>
                    Aktivna
                  </Pill>
                  <Pill count={3}>Neaktivna</Pill>
                  <Pill>Vsa vozila</Pill>
                </div>
                <div className="grid grid-cols-3 gap-4 border-t border-line pt-5">
                  <Stat label="Avtohiše" value="27" note="cilj 30" />
                  <Stat label="SMS / mesec" value="300" note="paket Osnovni" />
                  <Stat label="Uporabniki" value="2/3" />
                </div>
              </Stack>
            </Card>
          </Grid>

          <Card>
            <CardHeader title="Obrazci" meta={<Eyebrow>Input · Select · Switch</Eyebrow>}>
              <Text size="small" tone="muted">
                Nastavitve avtohiše → Pravila naročanja
              </Text>
            </CardHeader>
            <Grid cols={3} from="md" gap="md">
              <Input label="Testna vožnja" defaultValue="45" suffix="min" inputMode="numeric" hint="Privzeto 45 minut" />
              <Input label="Minimalni čas vnaprej" defaultValue="2" suffix="h" inputMode="numeric" />
              <Input label="Razmik med termini" defaultValue="15" suffix="min" inputMode="numeric" />
              <Input
                label="Ime pošiljatelja SMS"
                defaultValue="Avto Novak d.o.o."
                error="Največ 11 znakov: črke, številke, presledek."
              />
              <Input label="Oglas na avto.net" placeholder="https://www.avto.net/Ads/details.asp?id=…" type="url" />
              <Select label="Vloga" defaultValue="salesperson">
                <option value="owner">Lastnik</option>
                <option value="salesperson">Prodajalec</option>
              </Select>
            </Grid>
            <div className="mt-6 grid gap-6 border-t border-line pt-6 md:grid-cols-2">
              <Switch label="SMS obvestila avtohiši" hint="Ob vsaki novi rezervaciji na 041 555 218" defaultChecked />
              <Switch label="Dvostopenjska prijava (TOTP)" hint="Koda iz aplikacije za preverjanje ob prijavi" />
              <Switch label="Odprto kljub prazniku" hint="Med shranjevanjem onemogočeno" defaultChecked disabled />
            </div>
          </Card>

          <Grid cols={3} from="md" gap="md">
            <Card tone="surface" cut>
              <Eyebrow tone="signal">Card · cut</Eyebrow>
              <Heading size="h3" className="mt-3">
                Licenca velja do 31. 12. 2026
              </Heading>
              <Text size="small" className="mt-2">
                Podaljšanje doda zapis v zgodovino licence z opombo.
              </Text>
            </Card>
            <Card tone="sunken">
              <Eyebrow>Card · sunken</Eyebrow>
              <Heading size="h3" className="mt-3">
                Prazniki 2027 so izračunani
              </Heading>
              <Text size="small" className="mt-2">
                Velikonočna nedelja 28. 3., velikonočni ponedeljek 29. 3., binkošti 16. 5.
              </Text>
            </Card>
            <Card tone="ink">
              <span className="type-utility text-signal">Card · ink</span>
              <h3 className="mt-3 text-h3 font-[650]">Ni še nobenega vozila</h3>
              <p className="mt-2 text-small opacity-80">Prilepite povezavo na avto.net — podatke poskusimo izpolniti samodejno.</p>
            </Card>
          </Grid>

          <div>
            <Eyebrow className="mb-3 block">PageHeader · Shell · Container · Grid</Eyebrow>
            <Card pad="lg">
              <PageHeader
                eyebrow="Nastavitve · Avto Novak"
                title="Delovni čas"
                description="Za vsak dan v tednu nič ali več nepekrivajočih se časovnih obdobij."
                actions={
                  <>
                    <Button variant="secondary" size="sm">
                      Kopiraj na vse dni
                    </Button>
                    <Button size="sm">Shrani</Button>
                  </>
                }
              />
            </Card>
          </div>

          <div>
            <Eyebrow className="mb-3 block">AppHeader · menu — pod lg se navigacija skrije za gumb Meni</Eyebrow>
            <div className="relative min-h-48 shadow-[inset_0_0_0_1px_var(--line)]" data-testid="design-compact-menu">
              <AppHeader
                context={<Text as="span" size="small">Avto Novak d.o.o.</Text>}
                nav={[
                  { label: "Račun", href: "#komponente", active: true },
                  { label: "Vozila", href: "#podpis" },
                ]}
                actions={
                  <Button variant="secondary" size="sm">
                    Odjava
                  </Button>
                }
                menu={{ label: "Meni", footer: <Text as="span" size="small">prodaja@avtonovak.si</Text> }}
              />
            </div>
          </div>
        </Stack>
      </Section>

      {/* 05 — Signature */}
      <Section
        id="podpis"
        index="05"
        title="Podpis"
        intro="Trenutek, ko stranka obljubi, da bo prišla. Termin kot fizična vozovnica — barvni trak avtohiše, prirezan vogal, perforiran odrezek s časom in žig prisotnosti. Proti neprihodom, oprijemljivo."
      >
        <Stack gap={8}>
          <div className="max-w-5xl">
            <DriveTicket t={ticket} statusLabel="Potrjeno" />
          </div>

          <Grid cols={2} from="lg" gap="md">
            <div data-theme="dark" className="flex flex-col gap-4 bg-ground p-5 text-ink md:p-6">
              <Eyebrow>Temni svet · data-theme=&quot;dark&quot;</Eyebrow>
              <div style={brandStyle(brandDemos[1].hex)}>
                <DriveTicket
                  animate={false}
                  statusLabel="Ni prišel"
                  t={{
                    ...ticket,
                    dealer: "Avtohiša Kranj",
                    car: "Toyota Yaris Cross",
                    carMeta: "1.5 Hybrid Executive · 2023 · 24.300 €",
                    kind: "Ogled vozila",
                    weekday: "Torek",
                    day: "20",
                    start: "09:15",
                    end: "09:45",
                    customer: "Luka Zupan",
                    phone: "+386 31 ••• 904",
                    code: "DB-R2TX-9H",
                    cutoffNote: "Termin je potekel",
                    reminderNote: undefined,
                    status: "no-show",
                  }}
                />
              </div>
            </div>
            <Card pad="lg">
              <CardHeader title="Delovni čas" meta={<Eyebrow tone="signal">Danes odprto do 18:00</Eyebrow>} />
              <HoursStrip days={weekHours} today={1} nowMin={10 * 60 + 40} />
              <div className="mt-6 flex flex-col gap-2 border-t border-line-strong pt-4">
                <Eyebrow>Prihajajoča zaprtja</Eyebrow>
                {upcomingClosures.map((c) => (
                  <div key={c.name} className="flex items-baseline justify-between gap-4 text-small">
                    <span className="font-mono tabular text-ink">{c.date}</span>
                    <span className="flex-1 text-ink-2">{c.name}</span>
                    <Badge tone={c.kind === "Praznik" ? "warn" : "neutral"}>{c.kind}</Badge>
                  </div>
                ))}
              </div>
            </Card>
          </Grid>
        </Stack>
      </Section>

      {/* 06 — Representative screen: public dealer page */}
      <Section
        id="zaslon"
        index="06"
        title="Zaslon · javna stran avtohiše"
        intro="novak.drivebook.si/?car=k7Qm2x — izbrano vozilo je prvo in uokvirjeno. Mobilno najprej (360 px, en stolpec), na namizju vozila v mreži, delovni čas ob strani."
      >
        <div className="shadow-[0_0_0_1px_var(--line-strong)]">
          {/* faux browser chrome */}
          <div className="flex h-10 items-center gap-3 bg-ink px-4 text-ground">
            <span className="flex gap-1.5" aria-hidden>
              <span className="size-2.5 bg-ground opacity-30" />
              <span className="size-2.5 bg-ground opacity-30" />
              <span className="size-2.5 bg-ground opacity-30" />
            </span>
            <span className="truncate font-mono text-caption opacity-80">https://{dealer.slug}.drivebook.si/?car={selected.id}</span>
          </div>

          <div className="bg-ground">
            {/* dealer header */}
            <header className="relative border-b border-line-strong">
              <span aria-hidden className="absolute inset-x-0 top-0 h-1.5 bg-brand" />
              <div className="flex flex-col gap-6 px-[var(--gutter)] pb-6 pt-8 md:flex-row md:items-end md:justify-between">
                <div className="flex items-center gap-4">
                  <span className="cut-tr grid size-16 shrink-0 place-items-center bg-ink text-ground type-display text-h2">AN</span>
                  <div>
                    <Heading size="d1" as="h2">
                      {dealer.name}
                    </Heading>
                    <p className="mt-1 text-body text-ink-2">{dealer.address}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <ButtonLink href={dealer.phoneHref} variant="secondary" size="md">
                    <span className="tabular">{dealer.phone}</span>
                  </ButtonLink>
                  <ButtonLink href={dealer.maps} variant="quiet" target="_blank" rel="noopener noreferrer">
                    Google Zemljevid
                  </ButtonLink>
                </div>
              </div>
            </header>

            <div className="grid gap-8 px-[var(--gutter)] py-8 lg:grid-cols-12 lg:gap-10">
              <div className="lg:col-span-8">
                <div className="mb-5 flex items-baseline justify-between">
                  <Heading size="h2">Vozila v ponudbi</Heading>
                  <Eyebrow>{cars.length} vozila</Eyebrow>
                </div>
                <div className="grid gap-5 sm:grid-cols-2">
                  <div className="sm:col-span-2 lg:col-span-1">
                    <CarCard car={selected} selected />
                  </div>
                  {rest.map((c) => (
                    <CarCard key={c.id} car={c} />
                  ))}
                </div>
              </div>

              <aside className="flex flex-col gap-6 lg:col-span-4">
                <div className="cut-tr cut-lg bg-signal-wash p-6 shadow-[inset_0_0_0_2px_var(--brand)]">
                  <div className="flex items-center justify-between gap-3">
                    <Eyebrow tone="signal">Rezervacija termina</Eyebrow>
                    <Badge tone="neutral" dot={false}>
                      Faza 2 · predogled
                    </Badge>
                  </div>
                  <Heading size="h2" className="mt-3">
                    Testna vožnja ali ogled
                  </Heading>
                  <Text size="small" className="mt-2">
                    Izberite vozilo in prost termin. Telefon potrdimo s kodo SMS, dan prej vas opomnimo.
                  </Text>
                  <div className="mt-5 grid grid-cols-4 gap-2" aria-hidden>
                    {["09:00", "09:15", "10:30", "11:00", "13:15", "14:30", "15:00", "16:45"].map((s, i) => (
                      <span
                        key={s}
                        className={`grid h-9 place-items-center font-mono text-code tabular ${
                          i === 5 ? "bg-brand text-on-brand" : "bg-surface text-ink shadow-[inset_0_0_0_1px_var(--line)]"
                        }`}
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                  <Button variant="brand" size="lg" className="mt-5 w-full" trailing={<Arrow />}>
                    Nadaljuj
                  </Button>
                </div>

                <Card>
                  <CardHeader title="Delovni čas" />
                  <HoursStrip days={weekHours} today={1} compact />
                </Card>

                <Card tone="sunken" pad="sm">
                  <Eyebrow tone="danger">Stanje · suspendirano</Eyebrow>
                  <Text size="small" tone="ink" className="mt-2">
                    Spletno naročanje trenutno ni na voljo, pokličite{" "}
                    <a href={dealer.phoneHref} className="font-[650] underline decoration-2 underline-offset-4 tabular">
                      {dealer.phone}
                    </a>
                    .
                  </Text>
                </Card>
              </aside>
            </div>

            <footer className="flex flex-col gap-2 border-t border-line px-[var(--gutter)] py-5 text-small text-muted md:flex-row md:justify-between">
              <span>
                Upravljavec osebnih podatkov: {dealer.legal} ·{" "}
                <a href="#" className="text-ink-2 underline underline-offset-4">
                  Politika zasebnosti
                </a>
              </span>
              <span className="type-utility">Poganja DriveBook</span>
            </footer>
          </div>
        </div>
      </Section>

      <footer className="border-t border-line-strong">
        <Container className="flex flex-col gap-3 py-8 md:flex-row md:items-center md:justify-between">
          <span className="text-small text-muted">Žetoni: src/styles/tokens.css · Primitivi: src/components/ui · Podpis: src/components/signature</span>
          <span className="type-utility text-ink">drivebook.si</span>
        </Container>
      </footer>
    </Shell>
  );
}
