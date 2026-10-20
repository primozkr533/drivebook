# DriveBook — project conventions

Multi-tenant SaaS (drivebook.si) for Slovenian car dealers: test-drive / viewing bookings from avto.net listings.
Stack: Next.js (App Router, TypeScript strict) · Tailwind CSS v4 · shadcn/ui · next-intl (sl, `messages/sl/*.json`) · PostgreSQL + Drizzle (migrations in `drizzle/`) · pg-boss · Vitest · Playwright.
Phase 1's base is in place: data model + tenant-isolated data layer, host-based routing, and the read-only public dealer page. Phase 1 features build on top of it.

## Commands
- `docker compose up --build` — starts `db` + `web` on http://localhost:3000 (`/` → `/design`); migrations and the demo seed run on start
- `npm run dev` — local dev server · `npm run build` — production build · `npm run typecheck`
- `npm run test` — Vitest (needs `docker compose up -d db`; uses the `drivebook_test` DB via `TEST_DATABASE_URL`)
- `npm run test:e2e` — Playwright against the running stack (`npx playwright install chromium` once)
- `npm run db:generate` — generate a Drizzle migration from `src/db/schema` into `drizzle/`
- `npm run db:migrate` — apply pending migrations · `npm run db:seed` — run the idempotent seed

FARM-RUN-CONTRACT
```
target: web
runs-where: container
run-via: compose
web-service: web
web-port: 3000
preview-path: /_dev/site/demo
smoke: docker compose exec -T web wget -qO- --header='Host: demo.drivebook.localhost' http://localhost:3000/ | grep -q 'Octavia'
```

## Structure
- `src/lib/config.ts` — the only env reader (`getConfig()`); also `RESERVED_SLUGS`
- `src/lib/date.ts` — the only Europe/Ljubljana date utility
- `src/db/` — schema (`src/db/schema/`), client, migrate, seed, `newPublicId` (`src/db/ids.ts`)
- `src/server/data/` — the tenant-isolated data layer (`DealerContext`, reads, `mutate.ts`)
- `src/server/auth/permissions.ts` — role helpers (`requireDealerRole`, `requireBackofficeRole`)
- `src/server/routing.ts` + `src/proxy.ts` — host routing (Next 16 proxy)
- `src/server/startup.ts` + `src/instrumentation.ts` — migrate + seed on server start
- `src/app/site/[slug]/` — public dealer site
- `src/app/dealer-admin/` — `app.` surface (dealer admin)
- `src/app/backoffice/` — `admin.` surface (backoffice)
- `src/i18n/request.ts` + `messages/sl/` — translations
- `tests/unit` (Vitest), `tests/e2e` (Playwright), `tests/setup` (test DB + global setup)

## Required environment variables
All have dev defaults in `docker-compose.yml` and are documented in `.env.example`. Provider keys are interpolated in compose as `${VAR:-}`, so they are optional; when absent, console mocks are used.
- `DATABASE_URL` — Postgres connection string for the app
- `TEST_DATABASE_URL` — Postgres connection string for Vitest (`drivebook_test`; must differ from `DATABASE_URL`)
- `APP_ENV` — `development` | `test` | `production` (dev aliases are off in production)
- `BASE_DOMAIN` — root domain for dealer subdomains and the `app.`/`admin.` surfaces (`drivebook.localhost` in dev)
- `RUN_MIGRATIONS_ON_START` — apply pending migrations when the server starts
- `SEED_ON_START` — run the idempotent seed (default plan, superadmin, demo dealer) when the server starts
- `SEED_SUPERADMIN_EMAIL` — email of the superadmin account created by the seed
- `AUTH_SECRET` — secret (≥ 32 chars) that encrypts TOTP secrets at rest and signs the TOTP pending token; required in production
- `FARM_TEST_AUTH` — `1` enables the gate-only test login route (off by default)
- `DEV_INBOX_ENABLED` — `1` serves the dev inbox in production (always on outside production)
- `NOTIFY_FAKE` — `1` forces the fake SMS/e-mail adapters even when provider keys are present
- `PUBLIC_URL_SCHEME` — `https` (default) or `http` (dev); scheme for absolute links in e-mails
- `PUBLIC_URL_PORT` — optional port appended to absolute links (`3000` in dev, empty in production)
- `TWILIO_ACCOUNT_SID` — Twilio account SID for SMS
- `TWILIO_AUTH_TOKEN` — Twilio auth token
- `TWILIO_FROM_NUMBER` — Twilio sender number (E.164)
- `BREVO_API_KEY` — Brevo API key for transactional email
- `BREVO_SENDER_EMAIL` — Brevo verified sender address
- `BREVO_SENDER_NAME` — display name on outgoing email
- `CLOUDFLARE_API_TOKEN` — Cloudflare API token for dealer custom domains
- `CLOUDFLARE_ZONE_ID` — Cloudflare zone ID for dealer custom domains

## Tenant isolation
1. Every dealer-scoped table has `dealer_id`; dealer-scoped reads and writes go only through functions in `src/server/data/` that take a `DealerContext` as their first argument. Pages, route handlers, middleware and components never import `@/db/client` or `@/db/schema` (a guard test enforces this).
2. A `DealerContext` is created only by `resolveDealerSlug` (public host) or, later, by the authenticated session — never from IDs supplied in a request.
3. Every dealer-scoped query filters by `ctx.dealerId`, including lookups by car ID (`getCar(ctx, id)`).
4. Every dealer-scoped write goes through `withDealerMutation(ctx, fn, audit?)`, which blocks `read_only`/`suspended` dealers and writes `audit_log` in the same transaction.
5. Admin actions and routes call `requireDealerRole(ctx, roles)` / `requireBackofficeRole(roles)` first; both are stubs that throw until auth exists.
6. Cross-tenant queries are backoffice-only and must call `requireBackofficeRole` first.
7. Public IDs (cars) are unguessable `newPublicId()` values, never sequential.
8. Reserved slugs (`RESERVED_SLUGS` in `src/lib/config.ts`) are never resolved as dealers.

## Routing
Host routing lives in `src/server/routing.ts` (pure, unit-tested) and is wired up by `src/proxy.ts`.
- `{slug}.{BASE_DOMAIN}` → rewrites to `/site/{slug}`
- `app.{BASE_DOMAIN}` → `/dealer-admin` · `admin.{BASE_DOMAIN}` → `/backoffice` (`/` is the signed-in home, which redirects to `/login` without a session; the dev aliases set `x-drivebook-base-path` to `/_dev/app` / `/_dev/admin`, read via `getSurfaceBasePath()`)
- Old (renamed) dealer slugs 301 to the current slug, keeping path and query
- Internal prefixes (`/site`, `/dealer-admin`, `/backoffice`, `/_dev`, `/dev`) 404 when requested directly on any other host — except that with dev aliases on, a non-dealer host 307s them to their alias (`/backoffice/*` → `/_dev/admin/*`, `/dealer-admin/*` → `/_dev/app/*`, `/site/*` → `/_dev/site/*`, `/dev` → `/_dev`)
- Dev aliases on non-dealer hosts (localhost, preview proxies; off in production): `/_dev/site/{slug}`, `/_dev/app`, `/_dev/admin` (plus `/_dev` → dev index page `src/app/dev/`, unknown `/_dev/*` redirect to it, and `/app`/`/admin` redirect to their aliases)
- Internal links on the dealer site are prefixed with the `x-drivebook-base-path` request header (empty on a real subdomain, `/_dev/site/{slug}` via the dev alias)
- The gate's browser probe crawls path literals in the repo (including tests): build deliberately-missing paths in tests from segments (`["", "_dev", "other"].join("/")`), never as a quoted slash-prefixed literal

## Design system

**Files**
- Tokens (single source of truth): `src/styles/tokens.css` — palette, type, space, layout, shape, elevation, motion, shadcn aliases.
- Tailwind mapping: `src/app/globals.css` (`@theme inline`) — default Tailwind palettes/radii/fonts/shadows are **reset**, so only token utilities exist (`bg-ground`, `text-ink`, `bg-signal`, `rounded-soft`, `shadow-hard`, `text-h2`, `type-utility`…).
- Primitives: `src/components/ui/` — `Button`/`ButtonLink`/`Arrow`, `Heading`/`Text`/`Eyebrow`/`SectionMark`, `Input`/`Select`/`Switch`, `Card`/`CardHeader`/`Stat`, `Badge`/`Pill`, `Shell`/`AppHeader`/`PageHeader`/`Container`/`Grid`/`Stack`/`Logo`.
- Signature components: `src/components/signature/` — `DriveTicket` (the booking pass), `HoursStrip` (opening hours as lanes), `CarCard` (+ `CopyLink` deep link), `Plate` (slug/code plate), `CarSilhouette` (image fallback).
- Branding helpers: `src/lib/color.ts` — `brandStyle(hex)`, `readableInk(hex)`, `contrast()`.
- Showcase: `/design` (`src/app/design/`) — static, no auth/data. Update it when you add or change a primitive.

**Aesthetic — "Signal & Tarmac".** Road infrastructure as visual language: warm-graphite asphalt neutrals (biased slightly toward the accent hue), ONE hot signal orange used as the single loud move (primary action, selection, "today", the brand band), Archivo expanded to 125 % at weight 800 for confident display caps, normal-width Archivo for reading, and JetBrains Mono uppercase-tracked for labels, codes and times. Shapes are sharp rectangles on hairline rules; the chamfered "plate-cut" corner and hard offset shadows are the signature details; dashed lane-marking rules divide. Layouts are left-aligned and gridded, never centred hero stacks. Light and dark are both first-class (`light-dark()` tokens; `data-theme` forces a world, also on a subtree). Motion is brief: one reveal (the DriveTicket arriving + its status stamp), micro hover lifts; everything collapses under `prefers-reduced-motion`.

**Hard rules**
1. Use the tokens. Never hardcode colours, spacing, radii, shadows, fonts or durations — no hex/rgb in components, no `bg-blue-500` (it doesn't exist), no `rounded-lg`, no `shadow-md`. Spacing is the 4 px grid (`p-4` = 16 px). If a value is missing, add a token to `tokens.css` first.
2. Build screens from the primitives. Every page = `Shell` → `AppHeader` → `Container` → `PageHeader` → `Grid`/`Stack` of `Card`s and fields.
3. New shared components **compose** primitives; they never restyle them. Don't fork a Button to change its look — add a variant in `Button.tsx` if one is truly needed.
4. One loud move per screen: `signal` (or `brand` on public pages) for the primary action/selection only. Status colours (`ok`/`warn`/`danger`) are for status, never decoration. Display type (`Heading size="mega"|"d1"|"h1"`) at most once per screen.
5. Dealer branding goes through the `--brand` / `--on-brand` slot: wrap the public page in `style={brandStyle(dealer.primaryColor)}` and use `bg-brand text-on-brand` / `Button variant="brand"`. Never compute contrast ad hoc; never put a dealer colour anywhere else.
6. shadcn/ui components added later inherit via the alias variables in `tokens.css` (`--background`, `--primary`, `--ring`…); after `npx shadcn add`, replace any `rounded-md` and other default classes with token utilities.
7. Text: all user-facing strings come from next-intl translation files in feature code (the `/design` specimen content in `src/app/design/content.ts` is the only exception). Times/dates are pre-formatted for Europe/Ljubljana by the date utility and passed into components — components never read the clock.
8. Accessibility: keep the `:focus-visible` ring (`--focus-ring`), text contrast ≥ 4.5:1 (use `signal-ink`, not `signal`, for orange TEXT), real labels on every field (`Input label=…`).

**Responsive rules (system-level — don't re-decide per screen)**
- Breakpoints are Tailwind defaults: `sm` 640 · `md` 768 · `lg` 1024 · `xl` 1280. Design mobile-first (public page at 360 px), then USE the width.
- Content width: `Container` (`--container-max` 1248 px, fluid `--gutter`); `width="narrow"` (704 px) only for single forms/reading. Never strand a phone-width column on desktop.
- Phones: one full-width column. From `md`/`lg`: multi-column via `Grid` (e.g. list + detail, cards 2–3 up, a `lg:col-span-8` main + `lg:col-span-4` aside).
- Components that can live in both a main column and an aside (`DriveTicket`, `HoursStrip`) respond to their **container** (`@container`, `@md:`/`@2xl:`), not the viewport. Do the same for new signature-level components.
- Dealer admin is desktop-first but must be usable on tablet/phone: `AppHeader` nav hides below `lg`; add a compact menu when real navigation exists.
