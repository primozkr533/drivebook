# DriveBook

Multi-tenant SaaS (drivebook.si) where Slovenian car dealers take test-drive and viewing bookings.
One Next.js (App Router, TypeScript strict) app serves three hosts: `{slug}.{BASE_DOMAIN}` (public
dealer page), `app.{BASE_DOMAIN}` (dealer admin), `admin.{BASE_DOMAIN}` (backoffice).

Current state: design foundation only (tokens, primitives, `/design` showcase). Feature stages add
Postgres/Drizzle, pg-boss, auth, host routing etc. on top of this skeleton.

## Commands

- `npm run dev` — dev server on :3000 (`/design` is the showcase)
- `npm run build` / `npm start` — production build (standalone output)
- `npm run typecheck`
- `docker compose up --build` — serves the app on http://localhost:3000

## Conventions

- **i18n:** next-intl, UI language Slovenian. Every user-facing string lives in `messages/sl.json`;
  components get strings via `useTranslations` / `getTranslations`. Only `/design` annotations
  (internal docs) are exempt.
- Time zone for display is `Europe/Ljubljana` (set in `src/i18n/request.ts`); never rely on server local time.
- Path alias `@/*` → `src/*`.

## Design system

**Files**
- Tokens (single source of truth): `src/styles/tokens.css` — palette (light + dark), type scale,
  spacing, radii, elevation, layout widths, motion.
- Token → Tailwind mapping: `src/app/globals.css` (`@theme inline`). Tailwind's default palette,
  fonts, radii and shadows are removed, so only token-backed classes exist (`bg-surface`,
  `text-ink`, `text-small`, `rounded-md`, `shadow-2`, `font-display`, `tracking-utility`, …).
  shadcn/ui variable names (`background`, `foreground`, `primary`, `muted`, `border`, `ring`, …)
  are aliased to our tokens, so generated shadcn components inherit the system.
- Primitives: `src/components/ui/` — `button` (primary/secondary/quiet/danger/brand),
  `field` (Field, Label, Input, Textarea), `card` (Card, CardHeader), `badge` (badge/pill shapes),
  `text` (Heading, Text, Eyebrow, Mono), `layout` (Container, Stack, Cluster, Grid, Split,
  PageHeader), `app-shell` (AppShell, Wordmark).
- Signatures: `src/components/signature/` — `BookingTicket` (the product's peak: the confirmed
  test drive), `CarCard` (+ `CopyLink` deep link), `Plate` (dealer slug as a registration plate),
  `OpeningHours`.
- Dealer branding: `src/lib/brand.ts` — `brandScope(hex)` sets `--brand` / `--brand-ink`
  (auto-contrast) on a wrapper; `--brand-soft` / `--brand-line` derive from it.
- Showcase: `/design` (`src/app/design/`) — static, no auth/data. Keep it updated when adding
  primitives.

**Aesthetic — "Avtocesta".** The calm, legible authority of Slovenian road signage and the
registration plate. A cool, green-tinted "alpine paper" ground (dark: deep petrol-black), ink and
every neutral biased toward the accent's green hue. Boldness is spent exactly once: motorway green
(`--primary`) — and on public dealer pages that slot is handed to the dealer's own colour
(`--brand`). Barlow Condensed for headings only (the sign panel), IBM Plex Sans for everything read,
IBM Plex Mono uppercase + tracked as the utility voice for times, prices, IDs and labels. Tight
corners (3–5px); only pills are round. Shadows tinted with ink. One motion moment (the "Telefon
preverjen" stamp on the ticket), disabled under reduced motion.

**Hard rules**
1. Use the tokens. Never hardcode colours, font sizes, spacing, radii, shadows or durations — no
   hex/rgb, no `text-[15px]`, no `rounded-[7px]`. If a value is missing, add a token to
   `tokens.css` (+ mapping in `globals.css`), then use it.
2. Build screens from the primitives in `src/components/ui` and the signatures. New shared
   components **compose** primitives; never restyle a primitive from the outside to make a
   variant — add a variant to the primitive instead.
3. One `primary` (or `brand`) button per view. Status colours (`warn`, `danger`, `info`) are
   functional only, never decorative.
4. Headings use `Heading` (display face); body uses `Text`; meta/labels use `Eyebrow`; times,
   prices, IDs, slugs use `Mono` / `font-mono tabular`. Don't use the display face for body copy.
5. Public dealer pages wrap content in `brandScope(dealer.primaryColor)` and use `brand`
   variants/utilities (`bg-brand`, `text-brand-ink`, `Button variant="brand"`). Admin and
   backoffice never use `brand` — they use `primary`.
6. Theme: light + dark via `data-theme` on `<html>` (boot script in `src/app/layout.tsx`). Never
   write theme-specific colours in components — tokens switch for you. Test both.
7. Motion: use `--motion-*` durations / `ease-out`; they zero under `prefers-reduced-motion`. No new
   ambient animations without a design decision.

**Responsive rules** (mobile-first; breakpoints `sm 40rem · md 48rem · lg 64rem · xl 80rem`)
- Every page sits in a `Container` (`narrow` 40rem for forms/auth, `default` 72rem for admin and
  the public page, `wide` 88rem for tables). Never a fixed phone-width column on desktop.
- Phones: one full-width column. From `md`/`lg`, use the width: `Split` (main + aside, side by
  side from lg), `Grid cols="cards"` (1→2→3), `Grid cols="form"` (paired fields from sm).
- The public page is designed at 360px first, then must also look composed on a laptop.
- Admin nav: `AppShell` handles phone (scrolling strip) vs desktop (inline) — don't re-solve it.

## Run contract

FARM-RUN-CONTRACT
```
web-service: web
web-port: 3000
preview-path: /design
```
