import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Wordmark } from "@/components/ui/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Container, Grid, Stack } from "@/components/ui/layout";
import { Eyebrow, Heading, Mono, Text } from "@/components/ui/text";
import { BookingTicket } from "@/components/signature/booking-ticket";
import { CarCard } from "@/components/signature/car-card";
import { OpeningHours } from "@/components/signature/opening-hours";
import { Plate } from "@/components/signature/plate";
import { brandScope } from "@/lib/brand";
import { Swatch, ThemeToggle } from "./_showcase/client";
import { AdminCarsScreen, PublicDealerScreen, SuspendedDealerScreen } from "./_showcase/screens";
import { cars, deepLink, hours, ticket } from "./_showcase/sample-data";

/*
 * /design — the living moodboard. Static: no auth, no data, no backend.
 * Annotations here are internal design documentation (English); every
 * product string inside the components comes from messages/sl.json.
 */

export const metadata: Metadata = { title: "DriveBook — Design foundation" };
export const dynamic = "force-static";

const palette: { group: string; items: { token: string; name: string; note?: string }[] }[] = [
  {
    group: "Ground & surfaces",
    items: [
      { token: "--ground", name: "Ground", note: "Alpine paper — page" },
      { token: "--surface", name: "Surface", note: "Cards, panels" },
      { token: "--surface-raised", name: "Raised", note: "Inputs, popovers" },
      { token: "--surface-sunk", name: "Sunk", note: "Wells, quiet fills" },
    ],
  },
  {
    group: "Ink & lines",
    items: [
      { token: "--ink", name: "Ink", note: "Headings, key text" },
      { token: "--ink-soft", name: "Ink soft", note: "Body copy" },
      { token: "--muted", name: "Muted", note: "Secondary, captions" },
      { token: "--faint", name: "Faint", note: "Placeholder, disabled" },
      { token: "--line", name: "Line", note: "Hairlines" },
      { token: "--line-strong", name: "Line strong", note: "Input borders" },
    ],
  },
  {
    group: "Accent — motorway green",
    items: [
      { token: "--primary", name: "Primary", note: "The one loud move" },
      { token: "--primary-strong", name: "Primary strong", note: "Hover, text on soft" },
      { token: "--primary-soft", name: "Primary soft", note: "Selection, wash" },
      { token: "--primary-ink", name: "Primary ink", note: "Text on primary" },
    ],
  },
  {
    group: "Status",
    items: [
      { token: "--warn", name: "Warn", note: "No-show risk, pending" },
      { token: "--danger", name: "Danger", note: "Failed, suspended" },
      { token: "--info", name: "Info", note: "Road-sign blue" },
      { token: "--plate-band", name: "Plate band", note: "Plate signature only" },
    ],
  },
];

const typeScale = [
  { token: "--type-display", label: "Display · 64", cls: "font-display text-display leading-tight font-semibold", sample: "14:30 — testna vožnja" },
  { token: "--type-h1", label: "H1 · 44", cls: "font-display text-h1 leading-tight font-semibold", sample: "Avto Novak, Ljubljana" },
  { token: "--type-h2", label: "H2 · 32", cls: "font-display text-h2 leading-snug font-semibold", sample: "Avtomobili v ponudbi" },
  { token: "--type-h3", label: "H3 · 24", cls: "font-display text-h3 leading-snug font-semibold", sample: "Pravila za rezervacije" },
  { token: "--type-h4", label: "H4 · 20", cls: "font-display text-h4 leading-snug font-semibold", sample: "Škoda Octavia Combi 2.0 TDI" },
  { token: "--type-lead", label: "Lead · 18", cls: "text-lead leading-body text-ink-soft", sample: "Stranka potrdi telefonsko številko s kodo SMS, zato termin res velja." },
  { token: "--type-body", label: "Body · 16", cls: "text-body leading-body text-ink-soft", sample: "Najmanjši čas pred rezervacijo je 2 uri, obdobje rezervacij pa 14 dni vnaprej." },
  { token: "--type-small", label: "Small · 14", cls: "text-small leading-body text-ink-soft", sample: "Prodajalec lahko ureja avtomobile, ne more pa spreminjati delovnega časa." },
  { token: "--type-caption", label: "Caption · 13", cls: "text-caption leading-snug text-muted", sample: "Največ 11 znakov, samo črke, številke in presledek." },
  { token: "--type-micro", label: "Utility · 11", cls: "font-mono text-micro uppercase tracking-utility text-muted", sample: "Št. rezervacije · DB-7KQ2-M9 · čet 22. okt" },
];

export default function DesignPage() {
  return (
    <div className="min-h-dvh bg-ground">
      {/* Showcase top bar */}
      <header className="sticky top-0 z-40 border-b border-line bg-[color-mix(in_oklab,var(--surface)_90%,transparent)] backdrop-blur-sm">
        <Container size="wide" className="flex h-[var(--header-h)] items-center justify-between gap-4">
          <Wordmark surface="Design foundation" />
          <nav className="hidden items-center gap-5 font-mono text-micro uppercase tracking-utility text-muted lg:flex">
            {["palette", "type", "scales", "primitives", "signatures", "brand", "screens"].map((id, i) => (
              <a key={id} href={`#${id}`} className="hover:text-ink">
                {String(i + 1).padStart(2, "0")} {id}
              </a>
            ))}
          </nav>
          <ThemeToggle />
        </Container>
      </header>

      {/* Intro */}
      <Container size="wide" className="py-12 md:py-16">
        <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,34rem)] lg:gap-16">
          <Stack gap={6}>
            <Eyebrow>DriveBook · drivebook.si · v1 foundation</Eyebrow>
            <Heading as="h1" size="display">
              Avtocesta.
              <span className="block text-muted">Signage-calm booking for car dealers.</span>
            </Heading>
            <Text size="lead" className="max-w-[58ch]">
              Built on the legibility of Slovenian road signs and the registration plate: a cool, green-tinted
              ground, petrol-black ink, condensed sign-panel headings and a mono utility voice for times, prices
              and IDs. Boldness is spent once — motorway green — and on public pages that slot is handed to the
              dealer&apos;s own colour.
            </Text>
            <div className="flex flex-wrap items-center gap-3">
              <Plate slug="novak" domain=".drivebook.si" size="lg" />
            </div>
          </Stack>
          <BookingTicket ticket={ticket} />
        </div>
      </Container>

      <Container size="wide" className="flex flex-col gap-20 pb-24 md:gap-24">
        {/* 01 Palette */}
        <Section id="palette" n="01" title="Palette" lead="Neutrals biased toward the accent's green (hue ≈155°). Values are read live from tokens.css.">
          <Grid cols="halves" gap={4}>
            {(["light", "dark"] as const).map((theme) => (
              <div key={theme} data-theme={theme} className="rounded-lg border border-line bg-ground p-5 md:p-6">
                <div className="mb-5 flex items-center justify-between">
                  <Eyebrow className="text-ink">{theme} theme</Eyebrow>
                  <div className="flex gap-1">
                    {["--ground", "--surface", "--ink", "--primary"].map((t) => (
                      <span key={t} className="h-2 w-6 rounded-xs border border-line" style={{ background: `var(${t})` }} />
                    ))}
                  </div>
                </div>
                <Stack gap={6}>
                  {palette.map((g) => (
                    <div key={g.group}>
                      <Eyebrow>{g.group}</Eyebrow>
                      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {g.items.map((s) => (
                          <Swatch key={s.token} {...s} />
                        ))}
                      </div>
                    </div>
                  ))}
                </Stack>
              </div>
            ))}
          </Grid>
        </Section>

        {/* 02 Type */}
        <Section
          id="type"
          n="02"
          title="Type"
          lead="Barlow Condensed for headings only (the sign panel). IBM Plex Sans for everything read. IBM Plex Mono, uppercase and tracked, as the utility register. All self-hosted, latin-ext for č š ž."
        >
          <Card pad="none" className="divide-y divide-line overflow-hidden">
            {typeScale.map((row) => (
              <div key={row.token} className="grid grid-cols-1 gap-2 px-5 py-4 md:grid-cols-[11rem_minmax(0,1fr)] md:items-baseline md:gap-6 md:px-6">
                <span className="flex flex-col">
                  <Eyebrow className="text-ink">{row.label}</Eyebrow>
                  <Mono className="text-micro text-faint">{row.token}</Mono>
                </span>
                <span className={`${row.cls} truncate text-ink`}>{row.sample}</span>
              </div>
            ))}
          </Card>
          <Grid cols="cards" gap={4} className="mt-4">
            <Card variant="sunk">
              <Eyebrow>Display</Eyebrow>
              <p className="mt-2 font-display text-h1 font-semibold leading-tight text-ink">Aa Čč Šš Žž 0123</p>
              <Text size="caption" tone="muted">Barlow Condensed 500/600/700</Text>
            </Card>
            <Card variant="sunk">
              <Eyebrow>Body</Eyebrow>
              <p className="mt-2 font-body text-h1 leading-tight text-ink">Aa Čč Šš Žž 0123</p>
              <Text size="caption" tone="muted">IBM Plex Sans 400/500/600</Text>
            </Card>
            <Card variant="sunk">
              <Eyebrow>Utility</Eyebrow>
              <p className="mt-2 font-mono text-h1 leading-tight tabular text-ink">08:00–12:00</p>
              <Text size="caption" tone="muted">IBM Plex Mono 400/500/600, tabular</Text>
            </Card>
          </Grid>
        </Section>

        {/* 03 Scales */}
        <Section id="scales" n="03" title="Space, radii, elevation, motion" lead="4px grid. Tight sign-panel corners — only pills are round. Shadows tinted with ink, never neutral black.">
          <Grid cols="halves" gap={4}>
            <Card>
              <CardHeader>
                <Eyebrow className="text-ink">Spacing · --space-*</Eyebrow>
              </CardHeader>
              <Stack gap={2}>
                {[1, 2, 3, 4, 6, 8, 12, 16, 24].map((n) => (
                  <div key={n} className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-3">
                    <Mono className="text-micro text-muted">--space-{n}</Mono>
                    <span className="h-3 rounded-xs bg-primary" style={{ width: `var(--space-${n})` }} />
                  </div>
                ))}
              </Stack>
            </Card>
            <Stack gap={4}>
              <Card>
                <CardHeader>
                  <Eyebrow className="text-ink">Radii · --corner-*</Eyebrow>
                </CardHeader>
                <div className="flex flex-wrap gap-4">
                  {(["xs", "sm", "md", "lg", "pill"] as const).map((r) => (
                    <div key={r} className="flex flex-col items-center gap-2">
                      <span className="size-14 border-2 border-ink bg-surface-sunk" style={{ borderRadius: `var(--corner-${r})` }} />
                      <Mono className="text-micro text-muted">{r}</Mono>
                    </div>
                  ))}
                </div>
              </Card>
              <Card>
                <CardHeader>
                  <Eyebrow className="text-ink">Elevation · --elev-*</Eyebrow>
                </CardHeader>
                <div className="grid grid-cols-3 gap-4">
                  {(["1", "2", "3"] as const).map((e) => (
                    <div key={e} className="grid h-16 place-items-center rounded-md bg-surface-raised" style={{ boxShadow: `var(--elev-${e})` }}>
                      <Mono className="text-micro text-muted">elev-{e}</Mono>
                    </div>
                  ))}
                </div>
              </Card>
              <Card>
                <CardHeader>
                  <Eyebrow className="text-ink">Motion · --motion-*</Eyebrow>
                </CardHeader>
                <Text size="small">
                  <Mono>fast 120ms</Mono> hover/press · <Mono>base 200ms</Mono> state · <Mono>slow 420ms</Mono> the one
                  moment: the &ldquo;verified&rdquo; stamp landing on the ticket. All zeroed under{" "}
                  <Mono>prefers-reduced-motion</Mono>.
                </Text>
              </Card>
            </Stack>
          </Grid>
        </Section>

        {/* 04 Primitives */}
        <Section id="primitives" n="04" title="Primitives" lead="src/components/ui — every screen is composed from these.">
          <Grid cols="halves" gap={4}>
            <Card>
              <CardHeader>
                <Eyebrow className="text-ink">Button</Eyebrow>
                <Mono className="text-micro text-faint">primary · secondary · quiet · danger · brand</Mono>
              </CardHeader>
              <Stack gap={4}>
                <div className="flex flex-wrap gap-2">
                  <Button>Shrani nastavitve</Button>
                  <Button variant="secondary">Povabi uporabnika</Button>
                  <Button variant="quiet">Prekliči</Button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm">Dodaj avtomobil</Button>
                  <Button size="sm" variant="secondary">Uvozi iz avto.net</Button>
                  <Button size="sm" variant="danger">Deaktiviraj</Button>
                  <Button size="sm" disabled>Shranjujem…</Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="lg">Rezerviraj testno vožnjo</Button>
                </div>
              </Stack>
            </Card>

            <Card>
              <CardHeader>
                <Eyebrow className="text-ink">Badge / Pill</Eyebrow>
                <Mono className="text-micro text-faint">tone × shape</Mono>
              </CardHeader>
              <Stack gap={4}>
                <div className="flex flex-wrap gap-2">
                  <Badge tone="primary" dot>Aktiven</Badge>
                  <Badge tone="danger" dot>Začasno ustavljen</Badge>
                  <Badge tone="warn">Tveganje za neprihod</Badge>
                  <Badge tone="info">Lastnik</Badge>
                  <Badge>Prodajalec</Badge>
                  <Badge tone="solid">2FA</Badge>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge shape="pill" tone="solid">Aktivni · 5</Badge>
                  <Badge shape="pill">Neaktivni · 1</Badge>
                  <Badge shape="pill" tone="primary">Paket Osnovni · 300 SMS</Badge>
                </div>
              </Stack>
            </Card>

            <Card>
              <CardHeader>
                <Eyebrow className="text-ink">Input + label</Eyebrow>
                <Mono className="text-micro text-faint">Field · Input · Textarea</Mono>
              </CardHeader>
              <Stack gap={4}>
                <Grid cols="form" gap={4}>
                  <Field id="d-name" label="Ime trgovca">
                    <Input id="d-name" defaultValue="Avto Novak" />
                  </Field>
                  <Field id="d-slug" label="Poddomena" hint="novak.drivebook.si">
                    <Input id="d-slug" defaultValue="novak" className="font-mono" aria-describedby="d-slug-hint" />
                  </Field>
                </Grid>
                <Field id="d-sender" label="Ime pošiljatelja SMS" error="Največ 11 znakov — vsebovati mora vsaj eno črko." >
                  <Input id="d-sender" defaultValue="AVTO NOVAK LJ" aria-invalid="true" aria-describedby="d-sender-error" />
                </Field>
                <Field id="d-notes" label="Opombe" optionalLabel="neobvezno">
                  <Textarea id="d-notes" placeholder="Interne opombe za zaledje…" />
                </Field>
              </Stack>
            </Card>

            <Stack gap={4}>
              <Card>
                <CardHeader>
                  <Eyebrow className="text-ink">Text / Heading</Eyebrow>
                </CardHeader>
                <Stack gap={2}>
                  <Heading size="h3">Pravila za rezervacije</Heading>
                  <Text>Trajanje testne vožnje je 45 minut, ogleda pa 30 minut. Med termini je 15 minut premora.</Text>
                  <Text size="small" tone="muted">Spremembe veljajo za nove rezervacije.</Text>
                </Stack>
              </Card>
              <Grid cols="halves" gap={4}>
                <Card variant="raised" pad="sm">
                  <Eyebrow>Card · raised</Eyebrow>
                  <Text size="small" className="mt-1">Dialogs, focused items.</Text>
                </Card>
                <Card variant="sunk" pad="sm">
                  <Eyebrow>Card · sunk</Eyebrow>
                  <Text size="small" className="mt-1">Wells, empty states.</Text>
                </Card>
                <Card pad="sm">
                  <Eyebrow>Card · plain</Eyebrow>
                  <Text size="small" className="mt-1">Default content block.</Text>
                </Card>
                <Card variant="outline" pad="sm">
                  <Eyebrow>Card · outline</Eyebrow>
                  <Text size="small" className="mt-1">&ldquo;Coming here&rdquo; slots.</Text>
                </Card>
              </Grid>
            </Stack>
          </Grid>
          <Card variant="sunk" className="mt-4">
            <Eyebrow className="text-ink">Layout primitives</Eyebrow>
            <Text size="small" className="mt-2">
              <Mono>Container</Mono> (narrow 40rem · default 72rem · wide 88rem, fluid gutter) ·{" "}
              <Mono>Stack</Mono> · <Mono>Cluster</Mono> · <Mono>Grid</Mono> (cards 1→2→3, tiles auto-fill, halves, form) ·{" "}
              <Mono>Split</Mono> (main + aside, side-by-side from lg) · <Mono>PageHeader</Mono> · <Mono>AppShell</Mono>.
              Breakpoints: <Mono>sm 40rem · md 48rem · lg 64rem · xl 80rem</Mono>. See the screens below at any width.
            </Text>
          </Card>
        </Section>

        {/* 05 Signatures */}
        <Section
          id="signatures"
          n="05"
          title="Signatures"
          lead="The booking ticket is the product's emotional peak: a test drive that will actually happen. The plate is how a dealer's address is shown. The car card is what customers tap."
        >
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
            <Stack gap={4}>
              <Eyebrow className="text-ink">BookingTicket · dealer colour on the stub</Eyebrow>
              <BookingTicket ticket={ticket} />
              <div {...brandScope("#c8102e")}>
                <BookingTicket
                  ticket={{
                    ...ticket,
                    reference: "DB-3HX8-T4",
                    kind: "viewing",
                    start: new Date("2026-10-24T07:00:00Z"),
                    end: new Date("2026-10-24T07:30:00Z"),
                    car: "Volkswagen Golf 1.5 eTSI Life · 2022",
                    customerName: "Luka Zupan",
                    customerPhone: "+386 31 ••• 904",
                    dealerName: "AC Mlakar",
                    dealerAddress: "Šentiljska cesta 49, Maribor",
                  }}
                />
              </div>
            </Stack>
            <Stack gap={4}>
              <Eyebrow className="text-ink">Plate · slug</Eyebrow>
              <Card className="flex flex-wrap items-center gap-4">
                <Plate slug="novak" size="sm" />
                <Plate slug="ac-mlakar" />
                <Plate slug="demo" domain=".drivebook.si" />
              </Card>
              <Eyebrow className="text-ink">OpeningHours</Eyebrow>
              <Card>
                <OpeningHours hours={hours} today="thu" />
              </Card>
            </Stack>
          </div>
          <div className="mt-6">
            <Eyebrow className="text-ink">CarCard · public, highlighted (?car=), admin with deep link, inactive</Eyebrow>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <CarCard car={cars[1]} />
              <CarCard car={cars[0]} highlighted />
              <CarCard car={cars[2]} deepLink={deepLink(cars[2].id)} />
              <CarCard car={cars[5]} deepLink={deepLink(cars[5].id)} />
            </div>
          </div>
        </Section>

        {/* 06 Brand */}
        <Section
          id="brand"
          n="06"
          title="Dealer branding"
          lead="Dealers pick any colour. brandScope(hex) sets --brand and picks --brand-ink (white or ink) for AA contrast. Only brand-aware pieces change; the system around them never does."
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {[
              { hex: "#0a7a4e", name: "Default (ours)" },
              { hex: "#c8102e", name: "AC Mlakar" },
              { hex: "#1d3557", name: "Avtohiša Bizjak" },
              { hex: "#f2c230", name: "Rumeni avti d.o.o." },
            ].map((b) => (
              <div key={b.hex} {...brandScope(b.hex)}>
                <Card className="flex h-full flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <Text size="small" weight="semibold" tone="strong">{b.name}</Text>
                    <Mono className="text-micro uppercase text-muted">{b.hex}</Mono>
                  </div>
                  <div className="h-10 rounded-sm bg-brand" />
                  <Button variant="brand" block>Rezerviraj termin</Button>
                  <div className="rounded-sm border border-brand-line bg-brand-soft px-3 py-2 text-small text-ink">
                    Izbrani avtomobil
                  </div>
                </Card>
              </div>
            ))}
          </div>
        </Section>

        {/* 07 Screens */}
        <Section
          id="screens"
          n="07"
          title="Representative screens"
          lead="Composed only from primitives + signatures. Resize the window: one column on phones, Split / Grid use the width from lg."
        >
          <Stack gap={8}>
            <Frame url="novak.drivebook.si/?car=k7Qm2xVa">
              <PublicDealerScreen brand="#0a7a4e" selectedId="k7Qm2xVa" />
            </Frame>
            <Frame url="app.drivebook.si/avtomobili">
              <AdminCarsScreen />
            </Frame>
            <Frame url="ac-mlakar.drivebook.si — suspended">
              <SuspendedDealerScreen brand="#c8102e" />
            </Frame>
          </Stack>
        </Section>
      </Container>
    </div>
  );
}

function Section({ id, n, title, lead, children }: { id: string; n: string; title: string; lead: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <div className="mb-8 grid grid-cols-1 gap-3 border-t-2 border-ink pt-4 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-10">
        <div className="flex items-baseline gap-3">
          <Mono className="text-small font-medium text-primary">{n}</Mono>
          <Heading size="h2">{title}</Heading>
        </div>
        <Text tone="muted" className="max-w-[70ch] lg:pt-2">{lead}</Text>
      </div>
      {children}
    </section>
  );
}

/** Browser-ish frame around a full screen composition. */
function Frame({ url, children }: { url: string; children: ReactNode }) {
  return (
    <figure className="overflow-hidden rounded-lg border border-line-strong shadow-3">
      <figcaption className="flex items-center gap-3 border-b border-line bg-surface-sunk px-4 py-2">
        <span className="flex gap-1.5" aria-hidden>
          <span className="size-2.5 rounded-pill bg-line-strong" />
          <span className="size-2.5 rounded-pill bg-line-strong" />
          <span className="size-2.5 rounded-pill bg-line-strong" />
        </span>
        <Mono className="truncate rounded-xs bg-surface px-2 py-0.5 text-caption text-muted">{url}</Mono>
      </figcaption>
      <div className="bg-ground">{children}</div>
    </figure>
  );
}
