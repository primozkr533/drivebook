import type { Metadata } from "next";
import type { ReactNode } from "react";
import {
  Badge,
  Button,
  Card,
  Container,
  Field,
  Figure,
  Grid,
  Heading,
  Input,
  Kicker,
  Notice,
  Rule,
  Section,
  Select,
  Text,
  TextLink,
  Textarea,
  Wordmark,
} from "@/components/ui";
import { CarCard } from "@/components/signature/car-card";
import { DealerMasthead } from "@/components/signature/dealer-masthead";
import { WeekHours } from "@/components/signature/week-hours";
import { brandStyle, contrastRatio, readableInk } from "@/lib/brand";
import { carLabels, cars, dealer, featuredCar, hours } from "./_parts/content";
import { AdminCarsScreen, PublicDealerScreen, SuspendedDealerScreen, mastheadFacts } from "./_parts/screens";
import { Swatch } from "./_parts/swatch";
import { ThemeToggle } from "./_parts/theme-toggle";

export const metadata: Metadata = { title: "Temelji oblikovanja · DriveBook" };
export const dynamic = "force-static";

/* The /design showcase: static, no auth, no data. The moodboard and the reference. */

const palette: { group: string; note: string; swatches: { token: string; name: string; role: string }[] }[] = [
  {
    group: "Podlaga",
    note: "Hladen papir. Nevtralne barve so rahlo nagnjene k modri poudarka, zato delujejo izbrano, ne sivo.",
    swatches: [
      { token: "ground", name: "Ground", role: "Ozadje strani" },
      { token: "surface", name: "Surface", role: "Obrazci, plošče, tabele" },
      { token: "sunken", name: "Sunken", role: "Vdolbine, prazna stanja" },
    ],
  },
  {
    group: "Črnilo",
    note: "Modro-črno črnilo, nikoli čisto črno. Muted je še vedno berljiv (≥ 4,5 : 1).",
    swatches: [
      { token: "ink", name: "Ink", role: "Naslovi, ključni podatki" },
      { token: "ink-soft", name: "Ink soft", role: "Telo besedila" },
      { token: "muted", name: "Muted", role: "Oznake, pomožno besedilo" },
      { token: "faint", name: "Faint", role: "Onemogočeno, okras" },
    ],
  },
  {
    group: "Črte",
    note: "Struktura prihaja iz črt, ne iz senc ali zaobljenih škatel.",
    swatches: [
      { token: "line", name: "Line", role: "Lasna črta, robovi polj" },
      { token: "rule", name: "Rule", role: "Uredniška črta v črnilu" },
    ],
  },
  {
    group: "Poudarek",
    note: "Ena nasičena poteza: kobaltna modra registrske tablice. Na strani trgovca jo zamenja barva znamke.",
    swatches: [
      { token: "accent", name: "Accent", role: "Primarni gumb, fokus, aktivno" },
      { token: "accent-strong", name: "Accent strong", role: "Besedilo na mehkem poudarku" },
      { token: "accent-soft", name: "Accent soft", role: "Izbor, informativna obvestila" },
    ],
  },
  {
    group: "Stanja",
    note: "Umirjena, da nikoli ne tekmujejo s poudarkom.",
    swatches: [
      { token: "positive", name: "Positive", role: "Aktivno, potrjeno" },
      { token: "caution", name: "Caution", role: "Opozorilo, ustavljeno" },
      { token: "negative", name: "Negative", role: "Napaka, uničujoče" },
      { token: "positive-soft", name: "Positive soft", role: "Ozadje stanja" },
      { token: "caution-soft", name: "Caution soft", role: "Ozadje stanja" },
      { token: "negative-soft", name: "Negative soft", role: "Ozadje stanja" },
    ],
  },
];

const typeScale: { token: string; spec: string; sample: ReactNode }[] = [
  {
    token: "display",
    spec: "Newsreader 380 · 56→136 px · −0,03 em",
    sample: (
      <Heading as="p" size="display">
        Testna vožnja, <em>brez čakanja.</em>
      </Heading>
    ),
  },
  {
    token: "3xl",
    spec: "Newsreader 400 · 44→80 px",
    sample: (
      <Heading as="p" size="3xl">
        Avto <em>Novak</em>
      </Heading>
    ),
  },
  {
    token: "2xl",
    spec: "Newsreader 420 · 34→52 px",
    sample: (
      <Heading as="p" size="2xl">
        Vozila <em>na ogled</em>
      </Heading>
    ),
  },
  { token: "xl", spec: "Newsreader 460 · 26→34 px", sample: <Heading as="p" size="xl">Škoda Octavia Combi</Heading> },
  { token: "lg", spec: "Newsreader 500 · 22 px", sample: <Heading as="p" size="lg">Pravila rezervacij</Heading> },
  {
    token: "md",
    spec: "Schibsted Grotesk 400 · 18 px · uvod",
    sample: (
      <Text size="md" measure>
        Stranka izbere vozilo in termin ter potrdi telefonsko številko. Vi dobite obvestilo — in manj praznih terminov.
      </Text>
    ),
  },
  {
    token: "base",
    spec: "Schibsted Grotesk 400 · 16 px · telo",
    sample: (
      <Text measure>
        Najmanjši čas vnaprej določa, koliko prej mora stranka rezervirati. Privzeto sta to dve uri, obzorje rezervacij pa
        štirinajst dni.
      </Text>
    ),
  },
  {
    token: "sm",
    spec: "Schibsted Grotesk 400 · 14 px · vmesnik",
    sample: <Text size="sm">Povabilo velja 7 dni. Lahko ga pošljete znova.</Text>,
  },
  {
    token: "caption",
    spec: "IBM Plex Mono 500 · 11 px · VELIKE · +0,14 em",
    sample: <Kicker index="03">Odpiralni čas · Prazniki</Kicker>,
  },
  { token: "figure", spec: "Newsreader tabularne številke", sample: <Figure size="2xl">21.490 €</Figure> },
];

const spaceSteps = [1, 2, 3, 4, 6, 8, 12, 16, 24];

const dealerBrands = [
  { name: "Avto Kolmanič", hex: "#C8102E", mono: "AK" },
  { name: "Avtocenter Zelenko", hex: "#0B6E4F", mono: "AZ" },
  { name: "Rumena Avtohiša", hex: "#F2C200", mono: "RA" },
];

export default function DesignPage() {
  return (
    <div className="bg-ground text-ink">
      {/* ── Cover ───────────────────────────────────────────── */}
      <header className="pt-4">
        <Container>
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-3">
            <div className="flex items-baseline gap-4">
              <Wordmark />
              <Kicker>Temelji oblikovanja</Kicker>
            </div>
            <div className="flex items-center gap-5">
              <Kicker className="hidden md:inline-flex">Izdaja 01 · Oktober 2026</Kicker>
              <ThemeToggle />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-8 pt-12 pb-10 lg:grid-cols-[minmax(0,8fr)_minmax(0,4fr)] lg:items-end lg:gap-gutter lg:pt-20 lg:pb-14">
            <Heading as="h1" size="display">
              Vsak trgovec dobi svojo <em>naslovnico.</em>
            </Heading>
            <Text size="md" className="lg:pb-3">
              DriveBook je uredniški, ne predlogast: hladen papir, modro-črno črnilo, serifni naslovi z ležečim registrom
              in ena sama nasičena poteza — kobaltna modra registrske tablice, ki jo na strani trgovca zamenja njegova
              barva.
            </Text>
          </div>
          <Rule weight="heavy" draw />
          <nav aria-label="Vsebina">
            <ol className="grid grid-cols-2 gap-x-6 gap-y-3 py-5 sm:grid-cols-3 lg:grid-cols-6">
              {["Paleta", "Tipografija", "Prostor in oblika", "Gradniki", "Podpisni elementi", "Zasloni"].map((s, i) => (
                <li key={s}>
                  <a href={`#s${i + 1}`} className="group flex flex-col gap-1">
                    <span className="font-utility text-caption tabular-nums text-muted">0{i + 1}</span>
                    <span className="text-sm font-semibold group-hover:text-accent">{s}</span>
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        </Container>
      </header>

      <Container>
        {/* ── 01 Palette ──────────────────────────────────────── */}
        <Section
          id="s1"
          index="01"
          kicker="Paleta"
          title={
            <>
              Papir, črnilo, <em>ena modra.</em>
            </>
          }
          intro="Vsaka barva je žeton v src/styles/tokens.css. Dnevna in nočna izdaja sta zapisani skupaj (light-dark), vrednosti hex spodaj se berejo naravnost iz žetonov — preklopite temo zgoraj."
        >
          <div className="flex flex-col gap-12">
            {palette.map((g) => (
              <div key={g.group} className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,9fr)] lg:gap-gutter">
                <div className="flex flex-col gap-2">
                  <Heading as="h3" size="lg">
                    {g.group}
                  </Heading>
                  <Text size="sm" tone="muted">
                    {g.note}
                  </Text>
                </div>
                <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 xl:grid-cols-4">
                  {g.swatches.map((s) => (
                    <Swatch key={s.token} {...s} large={g.group === "Poudarek"} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* ── 02 Type ─────────────────────────────────────────── */}
        <Section
          id="s2"
          index="02"
          kicker="Tipografija"
          title={
            <>
              Naslov kot v reviji, <em>podatki kot v voznem redu.</em>
            </>
          }
          intro="Tri pisave, vse samostojno gostovane (npm @fontsource), s polnim naborom za č, š, ž. Display serif z zmernostjo, čist grotesk za vmesnik, mono z razmikom za oznake."
        >
          <Grid layout="thirds" className="mb-16">
            <Card variant="ruled" padding="sm" className="flex flex-col gap-3">
              <Kicker>Display · --font-display</Kicker>
              <span className="pt-2 font-display text-3xl leading-tight">
                Aa <em className="font-[300] italic">Čž</em>
              </span>
              <Text size="sm">Newsreader — optične velikosti, ležeči rez za poudarke. Samo naslovi in številke.</Text>
            </Card>
            <Card variant="ruled" padding="sm" className="flex flex-col gap-3">
              <Kicker>Telo · --font-body</Kicker>
              <span className="pt-2 font-body text-3xl leading-tight font-[500]">Aa Šš</span>
              <Text size="sm">Schibsted Grotesk — časopisni grotesk za vse besedilo vmesnika in obrazcev.</Text>
            </Card>
            <Card variant="ruled" padding="sm" className="flex flex-col gap-3">
              <Kicker>Oznake · --font-utility</Kicker>
              <span className="pt-2 font-utility text-3xl leading-tight">08:45</span>
              <Text size="sm">IBM Plex Mono — oznake polj, naslovi stolpcev, časi, ID-ji. Vedno VELIKE z razmikom.</Text>
            </Card>
          </Grid>

          <div className="flex flex-col">
            {typeScale.map((t) => (
              <div
                key={t.token}
                className="grid grid-cols-1 gap-3 border-t border-line py-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,9fr)] lg:gap-gutter"
              >
                <div className="flex flex-col gap-1">
                  <span className="font-utility text-xs text-ink">text-{t.token}</span>
                  <span className="text-xs text-muted">{t.spec}</span>
                </div>
                <div className="min-w-0">{t.sample}</div>
              </div>
            ))}
          </div>
        </Section>

        {/* ── 03 Space, shape, depth, motion ─────────────────── */}
        <Section
          id="s3"
          index="03"
          kicker="Prostor in oblika"
          title={
            <>
              Mreža 4 px, <em>pravi koti.</em>
            </>
          }
          intro="Tisk je oglat: kartice in slike nimajo zaobljenja, gumbi in polja 2 px. Sence samo za plavajoče plasti. Gibanje: en sam trenutek — črta pod imenom trgovca se izriše ob nalaganju."
        >
          <Grid layout="halves" className="gap-y-14">
            <div className="flex flex-col gap-4">
              <Kicker tone="ink">Razmiki · --spacing × n</Kicker>
              {spaceSteps.map((n) => (
                <div key={n} className="flex items-center gap-4">
                  <span className="w-14 font-utility text-caption tabular-nums text-muted">
                    {n} · {n * 4}px
                  </span>
                  <span className="h-3 bg-accent" style={{ width: `calc(var(--spacing) * ${n})` }} />
                </div>
              ))}
              <div className="flex items-center gap-4">
                <span className="w-14 font-utility text-caption text-muted">gutter</span>
                <span className="h-3 w-gutter bg-ink" />
              </div>
              <div className="flex items-center gap-4">
                <span className="w-14 font-utility text-caption text-muted">section</span>
                <span className="h-3 w-section bg-ink" />
              </div>
            </div>

            <div className="flex flex-col gap-10">
              <div className="flex flex-col gap-4">
                <Kicker tone="ink">Zaobljenja</Kicker>
                <div className="grid grid-cols-4 gap-4">
                  {(["none", "hair", "soft", "pill"] as const).map((r) => (
                    <div key={r} className="flex flex-col gap-2">
                      <div
                        className="aspect-square border border-rule bg-surface"
                        style={{ borderRadius: `var(--radius-${r})` }}
                      />
                      <span className="font-utility text-caption text-muted">{r}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-4">
                <Kicker tone="ink">Globina</Kicker>
                <div className="grid grid-cols-2 gap-6">
                  <div className="flex h-24 items-end bg-surface p-3 shadow-raise">
                    <span className="font-utility text-caption text-muted">shadow-raise · meniji</span>
                  </div>
                  <div className="flex h-24 items-end rounded-soft bg-surface p-3 shadow-overlay">
                    <span className="font-utility text-caption text-muted">shadow-overlay · dialogi</span>
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-3">
                <Kicker tone="ink">Gibanje</Kicker>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
                  {[
                    ["fast", "120 ms"],
                    ["base", "200 ms"],
                    ["slow", "420 ms"],
                    ["reveal", "900 ms"],
                  ].map(([k, v]) => (
                    <div key={k} className="flex flex-col border-t border-line pt-2">
                      <dt className="font-utility text-caption text-muted">--duration-{k}</dt>
                      <dd className="tabular-nums">{v}</dd>
                    </div>
                  ))}
                </dl>
                <Text size="xs" tone="muted">
                  Pri prefers-reduced-motion so vse trajanja 0 ms — v žetonih, na enem mestu.
                </Text>
              </div>
              <div className="flex flex-col gap-3">
                <Kicker tone="ink">Prelomne točke</Kicker>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
                  {[
                    ["sm", "640", "telefon ležeče"],
                    ["md", "768", "tablica"],
                    ["lg", "1024", "stran ob strani"],
                    ["xl", "1280", "največja širina"],
                  ].map(([k, v, d]) => (
                    <div key={k} className="flex flex-col border-t border-line pt-2">
                      <dt className="font-utility text-caption text-muted">
                        {k} · {v}px
                      </dt>
                      <dd className="text-xs">{d}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          </Grid>
        </Section>

        {/* ── 04 Primitives ───────────────────────────────────── */}
        <Section
          id="s4"
          index="04"
          kicker="Gradniki"
          title={
            <>
              Iz teh se sestavi <em>vsak zaslon.</em>
            </>
          }
          intro="src/components/ui — gumbi, polja, kartice, značke, besedilo in lupine. Novi deljeni elementi te sestavljajo, nikoli jih ne preoblikujejo."
        >
          <div className="flex flex-col gap-16">
            <Specimen title="Gumbi" note="Primary je edina nasičena ploskev na zaslonu — en na pogled. Secondary je obris v črnilu, quiet je povezava.">
              <div className="flex flex-col gap-6">
                <div className="flex flex-wrap items-center gap-4">
                  <Button>Shrani nastavitve</Button>
                  <Button variant="secondary">Pošlji povabilo znova</Button>
                  <Button variant="quiet">Prekliči</Button>
                </div>
                <div className="flex flex-wrap items-center gap-4">
                  <Button size="lg">Izberi termin</Button>
                  <Button size="sm" variant="secondary">
                    Uredi
                  </Button>
                  <Button size="sm" variant="quiet">
                    Deaktiviraj
                  </Button>
                  <Button disabled>Shranjujem …</Button>
                </div>
              </div>
            </Specimen>

            <Specimen title="Polja" note="Oznaka v mono, polje v telesni pisavi. Enote so del polja. Napaka zamenja namig, nikoli ga ne doda.">
              <Grid layout="halves" gap="tight" className="gap-y-6">
                <Field label="Ime za pošiljanje SMS" htmlFor="sp-sender" hint="Največ 11 znakov: črke, številke, presledek.">
                  <Input id="sp-sender" defaultValue="AvtoNovak" maxLength={11} />
                </Field>
                <Field label="Trajanje testne vožnje" htmlFor="sp-dur" hint="Privzeto 45 minut.">
                  <Input id="sp-dur" inputMode="numeric" defaultValue="45" suffix="min" />
                </Field>
                <Field label="E-pošta" htmlFor="sp-mail" error="Vnesite veljaven e-poštni naslov.">
                  <Input id="sp-mail" invalid defaultValue="prodaja@avtonovak" />
                </Field>
                <Field label="Vloga" htmlFor="sp-role">
                  <Select id="sp-role" defaultValue="sales">
                    <option value="owner">Lastnik</option>
                    <option value="sales">Prodajalec</option>
                  </Select>
                </Field>
                <Field label="Razlog zaprtja" htmlFor="sp-reason" optionalLabel="Neobvezno" className="md:col-span-2">
                  <Textarea id="sp-reason" defaultValue="Kolektivni dopust, 3.–14. 8." />
                </Field>
              </Grid>
            </Specimen>

            <Specimen title="Kartice in obvestila" note="Štiri različice: surface za obrazce, ruled za uredniške stolpce, sunken za prazna stanja, outline za sezname.">
              <div className="flex flex-col gap-6">
                <Grid layout="thirds" gap="tight">
                  <Card className="flex flex-col gap-2">
                    <Kicker>surface</Kicker>
                    <Heading as="h4" size="lg">
                      Podatki trgovca
                    </Heading>
                    <Text size="sm">Ime, naslov, telefon in povezava do zemljevida.</Text>
                  </Card>
                  <Card variant="ruled" className="flex flex-col gap-2">
                    <Kicker>ruled</Kicker>
                    <Heading as="h4" size="lg">
                      Prazniki 2026
                    </Heading>
                    <Text size="sm">14 dela prostih dni, vključno z veliko nočjo in binkoštmi.</Text>
                  </Card>
                  <Card variant="sunken" className="flex flex-col gap-2">
                    <Kicker>sunken</Kicker>
                    <Heading as="h4" size="lg">
                      Še ni vozil
                    </Heading>
                    <Text size="sm">Dodajte prvo vozilo ali prilepite povezavo do oglasa.</Text>
                  </Card>
                </Grid>
                <Notice tone="info" label="Namig">
                  Stari naslov <code className="font-utility text-xs">novak-avto.drivebook.si</code> se samodejno preusmeri na novega.
                </Notice>
                <Notice tone="positive" label="Shranjeno">Delovni čas je posodobljen in že viden na vaši strani.</Notice>
                <Notice tone="negative" label="Napaka" action={<Button size="sm" variant="secondary">Poskusi znova</Button>}>
                  Doseženo je največje število uporabnikov za paket Osnovni (3).
                </Notice>
              </div>
            </Specimen>

            <Specimen title="Značke" note="Oglate za stanja in podatke, pill za vloge in filtre. Barva samo, kadar nosi pomen.">
              <div className="flex flex-wrap items-center gap-3">
                <Badge tone="positive" dot>
                  Aktiven
                </Badge>
                <Badge tone="caution" dot>
                  Začasno ustavljen
                </Badge>
                <Badge tone="negative">Neuspešno</Badge>
                <Badge tone="accent">Licenca do 31. 12. 2026</Badge>
                <Badge>Neaktivno</Badge>
                <Badge tone="ink">Superadmin</Badge>
                <Badge shape="pill">Lastnik</Badge>
                <Badge shape="pill">Prodajalec</Badge>
                <Badge shape="pill">Podpora</Badge>
              </div>
            </Specimen>

            <Specimen title="Besedilo" note="Heading z <em> za ležeči register, Kicker z zaporedno številko, Rule v štirih debelinah, TextLink z oznako za zunanje povezave.">
              <div className="flex flex-col gap-5">
                <Kicker index="02">Pravila rezervacij</Kicker>
                <Heading as="p" size="xl">
                  Koliko vnaprej <em>lahko stranka rezervira?</em>
                </Heading>
                <Text measure>
                  Obzorje rezervacij je 14 dni, najmanjši čas vnaprej 2 uri. Stranka lahko termin odpove ali prestavi do
                  2 uri pred začetkom. <TextLink href="#">Več o pravilih</TextLink> ·{" "}
                  <TextLink href="https://www.avto.net" external>
                    avto.net
                  </TextLink>
                </Text>
                <div className="flex flex-col gap-4 pt-2">
                  <Rule weight="hair" />
                  <Rule weight="ink" />
                  <Rule weight="heavy" />
                  <Rule weight="brand" />
                </div>
              </div>
            </Specimen>
          </div>
        </Section>

        {/* ── 05 Signature ────────────────────────────────────── */}
        <Section
          id="s5"
          index="05"
          kicker="Podpisni elementi"
          title={
            <>
              Naslovnica trgovca <em>in vozilo kot reportaža.</em>
            </>
          }
          intro="Ko stranka odpre povezavo iz oglasa, mora takoj vedeti, pri kom je in katero vozilo si gre ogledat. To je čustveni vrh izdelka — in zato ga nosi uredniška obdelava."
        >
          <div className="flex flex-col gap-16">
            <Specimen title="DealerMasthead" note="Ime v display serifu, črta v barvi znamke se ob nalaganju izriše, kolofon z dejstvi. Brez logotipa: monogram.">
              <div className="border border-line">
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
              </div>
            </Specimen>

            <Specimen title="CarCard · izbrano" note="Stanje ?car={id}: vozilo, zaradi katerega je stranka prišla. Črta znamke, velika cena, prostor za dejanje iz faze 2.">
              <CarCard
                featured
                car={featuredCar}
                labels={carLabels}
                action={<Button size="lg">Izberi termin za testno vožnjo</Button>}
              />
            </Specimen>

            <Specimen title="CarCard · mreža" note="Tri v vrsti na namizju, dve na tablici, ena na telefonu. Brez fotografije: tiha plošča z začetnico znamke.">
              <Grid layout="thirds" className="gap-y-10">
                {[cars[0], cars[3], cars[2]].map((car) => (
                  <CarCard key={car.id} car={car} labels={carLabels} priority />
                ))}
              </Grid>
            </Specimen>

            <Specimen title="WeekHours" note="Več časovnih razponov na dan, danes označen s črto znamke, zaprti dnevi v ležečem.">
              <div className="max-w-md">
                <WeekHours days={hours} closedLabel="Zaprto" todayLabel="Danes" />
              </div>
            </Specimen>

            <Specimen
              title="Barva znamke"
              note="brandStyle(hex) nastavi --brand in samodejno izbere berljivo barvo besedila (črnilo ali papir) — zahteva iz nastavitev blagovne znamke."
            >
              <Grid layout="thirds" gap="tight">
                {dealerBrands.map((b) => {
                  const ink = readableInk(b.hex);
                  return (
                    <div key={b.hex} style={brandStyle(b.hex)} className="flex flex-col gap-4 border border-line bg-surface p-5">
                      <div className="flex items-center gap-3">
                        <span className="flex size-12 items-center justify-center bg-brand font-display text-lg italic text-brand-ink">
                          {b.mono}
                        </span>
                        <div className="flex flex-col">
                          <span className="text-sm font-semibold">{b.name}</span>
                          <span className="font-utility text-caption text-muted">
                            {b.hex} · {contrastRatio(b.hex, ink).toFixed(1)} : 1
                          </span>
                        </div>
                      </div>
                      <Rule weight="brand" />
                      <Button>Izberi termin</Button>
                    </div>
                  );
                })}
              </Grid>
            </Specimen>
          </div>
        </Section>
      </Container>

      {/* ── 06 Screens ─────────────────────────────────────────── */}
      <Container>
        <Section
          id="s6"
          index="06"
          kicker="Zasloni"
          title={
            <>
              Kako se sestavi <em>prava stran.</em>
            </>
          }
          intro="Javna stran trgovca na namizju (s ?car=), ista stran v stanju ustavitve in skrbniški seznam vozil. Vse zgolj iz zgornjih gradnikov."
        >
          <div className="flex flex-col gap-16">
            <ScreenFrame url={`${dealer.host}/?car=${featuredCar.id}`}>
              <PublicDealerScreen />
            </ScreenFrame>
            <Grid layout="halves" className="items-start">
              <ScreenFrame url={dealer.host} caption="Trgovec je začasno ustavljen: samo glava in poziv k klicu.">
                <SuspendedDealerScreen />
              </ScreenFrame>
              <Card variant="ruled" padding="sm" className="flex flex-col gap-4">
                <Kicker tone="ink">Pravila za odzivnost</Kicker>
                <ul className="flex flex-col gap-3 text-sm text-ink-soft">
                  <li>Telefon (360 px): en stolpec čez vso širino, kolofon v dveh stolpcih.</li>
                  <li>Tablica (768 px): mreže vozil v dveh stolpcih, obrazci z oznako ob strani.</li>
                  <li>Namizje (1024 px+): vsebina + stranski stolpec, tri vozila v vrsti, največja širina 1280 px.</li>
                  <li>Nikoli ozkega telefonskega stolpca sredi praznega namizja.</li>
                </ul>
              </Card>
            </Grid>
            <ScreenFrame url="app.drivebook.si/vozila">
              <AdminCarsScreen />
            </ScreenFrame>
          </div>
        </Section>
      </Container>

      <footer className="border-t border-line py-8">
        <Container className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Wordmark />
          <Kicker>Žetoni: src/styles/tokens.css · Gradniki: src/components/ui</Kicker>
        </Container>
      </footer>
    </div>
  );
}

function Specimen({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,9fr)] lg:gap-gutter">
      <div className="flex flex-col gap-2 border-t border-line pt-4">
        <Heading as="h3" size="lg">
          {title}
        </Heading>
        <Text size="sm" tone="muted">
          {note}
        </Text>
      </div>
      <div className="min-w-0 border-t border-line pt-6">{children}</div>
    </div>
  );
}

function ScreenFrame({ url, caption, children }: { url: string; caption?: string; children: ReactNode }) {
  return (
    <figure className="flex flex-col gap-3">
      <div className="overflow-hidden border border-rule bg-ground shadow-raise">
        <div className="flex items-center gap-3 border-b border-line bg-surface px-4 py-2.5">
          <span className="flex gap-1.5" aria-hidden>
            <span className="size-2 rounded-pill bg-line" />
            <span className="size-2 rounded-pill bg-line" />
            <span className="size-2 rounded-pill bg-line" />
          </span>
          <span className="font-utility text-xs text-muted">{url}</span>
        </div>
        {children}
      </div>
      {caption && <figcaption className="text-xs text-muted">{caption}</figcaption>}
    </figure>
  );
}
