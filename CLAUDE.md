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
- `npm run worker` — notification worker (pg-boss `notify.email` / `notify.sms`); runs as the `worker` compose service, `web` never depends on it
- `npm run create-superadmin -- --email x` — create/invite a backoffice superadmin and print the set-password link
- `npm run user-admin -- deactivate --surface dealer|backoffice --email x` — deactivate a user on that surface and revoke all of their sessions (unknown e-mail exits non-zero)
- `npm run user-admin -- resend-invite --surface dealer|backoffice --email x` — re-issue an invited user's 7-day set-password link, queue the invitation e-mail and print the link
- `docker compose -f docker-compose.prod.yml up -d --build` — production stack (reads `.env`; Caddy on 80/443, `migrate` runs before `web`/`worker`); see `docs/deploy.md`

FARM-RUN-CONTRACT
```
target: web
runs-where: container
run-via: compose
web-service: web
web-port: 3000
preview-path: /_dev/site/demo
smoke: docker compose exec -T web wget -qO- --header='Host: demo.drivebook.localhost' http://localhost:3000/ | grep -q 'Octavia'
test-login: POST /api/test/login (requires FARM_TEST_AUTH=1; sets db_app_session for the demo Owner; then open /_dev/app)
```

## Structure
- `src/lib/config.ts` — the only env reader (`getConfig()`); also `RESERVED_SLUGS`
- `src/lib/address.ts` — `dealerAddress()` (trimmed dealer address parts, shared by the public dealer and privacy pages)
- `src/lib/date.ts` — the only Europe/Ljubljana date utility; also `easterSunday` / `slovenianWorkFreeDays` (Slovenian work-free days)
- `src/db/` — schema (`src/db/schema/`), client, migrate, seed, `newPublicId` (`src/db/ids.ts`)
- `src/server/data/` — the tenant-isolated data layer (`DealerContext`, reads, `mutate.ts`)
- `src/server/data/backoffice/` — the cross-tenant backoffice data layer: `withBackofficeMutation` (`mutate.ts`; Superadmin-only, audited, not blocked by dealer status), `validateSlug` (`slug.ts`), dealers (list/detail/create/manage, `dealers.ts`), plans (`plans.ts`), backoffice users (`users.ts`). Every function calls `requireBackofficeRole` first.
- `src/server/data/settings-dealer.ts`, `src/server/data/settings-branding.ts`, `src/server/data/settings-booking.ts`, `src/server/data/settings-hours.ts`, `src/server/data/dealer-users.ts` — Owner-only settings services (every function calls `requireDealerRole(ctx, ['owner'])` first)
- `src/server/data/availability.ts` — `isDealerClosed(ctx, date)`, `getOpeningRangesForDate`, `getClosedDatesBetween` (shared with the phase-2 slot engine)
- `src/app/dealer-admin/(app)/settings/*` (`src/app/dealer-admin/(app)/settings/`) and `src/app/dealer-admin/(app)/users` — Owner settings and users pages, gated by `requireOwnerPage()` in `src/app/dealer-admin/(app)/owner-gate.tsx`
- `src/server/auth/permissions.ts` — role helpers (`requireDealerRole`, `requireBackofficeRole`)
- `src/server/routing.ts` + `src/proxy.ts` — host routing (Next 16 proxy)
- `src/server/startup.ts` + `src/instrumentation.ts` — migrate + seed on server start
- `src/server/notify/queue.ts` — `sendEmail`/`sendSms` (log to `message_log` + enqueue; never throw), job handlers, `drainNotificationsForTest()` · `src/worker.ts` — worker entrypoint
- `src/server/storage/` — `FileStorage` (put/get/delete/url) via `getStorage()`, local disk at `STORAGE_DIR`; files are served by the files route (`src/app/api/files/[...key]/route.ts`, see `## API Contract`)
- `src/app/site/[slug]/` — public dealer site
- `src/app/api/test/login/route.ts` — gate-only test login (`FARM_TEST_AUTH=1`); farm infrastructure, never remove or weaken it; the demo Owner is resolved by `src/server/auth/test-login.ts`
- `src/app/dealer-admin/` — `app.` surface (dealer admin); signed-in pages live in `(app)/` (layout = `AdminHeader` from `src/components/auth/`)
- `src/app/backoffice/` — `admin.` surface (backoffice); signed-in pages live in `(app)/`
- `src/app/backoffice/(app)/dealers`, `src/app/backoffice/(app)/plans`, `src/app/backoffice/(app)/users` — operator pages (Support: read-only UI, writes refused on the server)
- `src/i18n/request.ts` + `messages/sl/` — translations (backoffice strings in `messages/sl/backoffice.json`)
- `tests/unit` (Vitest), `tests/e2e` (Playwright), `tests/setup` (test DB + global setup)
- `docker-compose.prod.yml` — production stack (`db`, one-shot `migrate`, `web`, `worker`, `backup`, `caddy`; only `caddy` publishes ports); `docker-compose.prod.local.yml` overrides it for a local run
- `docker/caddy` — Caddy image (xcaddy + Cloudflare DNS) and `docker/caddy/Caddyfile` (wildcard certificate via DNS-01, reverse proxy to `web:3000`)
- `docker/backup` — backup image: nightly `pg_dump` + uploads archive, retention, `docker/backup/restore.sh`, round-trip check `docker/backup/test-restore.sh`
- `docs/deploy.md` — production/staging deployment, backups and updates
- `docs/performance.md` — how to measure the public dealer page with Lighthouse (mobile, 360 px) and the recorded score
- `src/app/fonts.ts` + `src/fonts/` — self-hosted Archivo / JetBrains Mono subsets (`next/font/local`) behind `--font-archivo` / `--font-jetbrains-mono` in `src/styles/tokens.css`; rebuild them with `src/fonts/subset-font.py`

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
- `STORAGE_DIR` — directory for uploaded files (dealer logos); a Docker volume at /data/storage in compose, `./data/storage` by default
- `TWILIO_ACCOUNT_SID` — Twilio account SID for SMS
- `TWILIO_AUTH_TOKEN` — Twilio auth token
- `TWILIO_FROM_NUMBER` — Twilio sender number (E.164)
- `BREVO_API_KEY` — Brevo API key for transactional email
- `BREVO_SENDER_EMAIL` — Brevo verified sender address
- `BREVO_SENDER_NAME` — display name on outgoing email
- `CLOUDFLARE_API_TOKEN` — Cloudflare API token for dealer custom domains
- `CLOUDFLARE_ZONE_ID` — Cloudflare zone ID for dealer custom domains
- `ALLOW_FAKE_PROVIDERS` — `1` lets a production `web`/`worker` start with the fake SMS/e-mail adapters (staging only; off by default)

Production stack only (`docker-compose.prod.yml`, Caddy, backup; not read by the app):
- `ACME_EMAIL` — contact e-mail for Let's Encrypt certificates
- `CLOUDFLARE_DNS_API_TOKEN` — Cloudflare token with Zone:DNS:Edit on the zone, for Caddy's DNS-01 wildcard certificate (separate from `CLOUDFLARE_API_TOKEN`)
- `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` — production Postgres container credentials; compose builds `DATABASE_URL` from them (`POSTGRES_PASSWORD` is required)
- `BACKUP_RETENTION_DAYS` — days of nightly backups kept in the `backups` volume (default 14)

## API Contract
- `POST /api/test/login`
  - Exists only when `FARM_TEST_AUTH=1` (`getConfig().farmTestAuth`). Otherwise it responds 404 (exactly as an unknown route).
  - Request body: none required. An optional JSON `{ "surface": "dealer" }` is accepted; only `dealer` is supported.
  - Response 200 JSON: `{ "ok": true, "user": { "email": string, "role": "owner" }, "dealerSlug": string, "redirect": string }`. `redirect` is the dealer admin home for the request host (`/` on `app.` hosts, `/_dev/app` on non-dealer dev hosts).
  - Sets the normal dealer session cookie `db_app_session` (httpOnly, Secure, SameSite=Lax, host-only) via `createSession` + `setSessionCookie` from `src/server/auth/session.ts`. Exception: with dev aliases on (never in production), a plain-http request on a host other than `localhost`/`*.localhost` (e.g. `http://web:3000`) gets the cookie without `Secure`, since browsers drop Secure cookies set over http there (`sessionCookieSecure` in `src/server/routing.ts`; the login form follows the same rule).
  - Is not available on dealer subdomain hosts (404).
- `GET /api/files/{key}` (key = slash-separated storage key, e.g. `logos/abc123.png`)
  - 200: body = the file bytes; headers `Content-Type` (stored type), `Content-Length`, `Cache-Control: public, max-age=31536000, immutable` (keys are unique per upload and never reused), `ETag` and `X-Content-Type-Options: nosniff`. For `image/svg+xml` also send `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; sandbox`.
  - 304 when `If-None-Match` matches the ETag.
  - 404 for an invalid key (traversal etc.) or a missing file.
  - `HEAD` is supported with the same headers and no body; other methods are not defined.

## Tenant isolation
1. Every dealer-scoped table has `dealer_id`; dealer-scoped reads and writes go only through functions in `src/server/data/` that take a `DealerContext` as their first argument. Pages, route handlers, middleware and components never import `@/db/client` or `@/db/schema` (a guard test enforces this).
2. A `DealerContext` is created only by `resolveDealerSlug` (public host) or, later, by the authenticated session — never from IDs supplied in a request.
3. Every dealer-scoped query filters by `ctx.dealerId`, including lookups by car ID (`getCar(ctx, id)`).
4. Every dealer-scoped write goes through `withDealerMutation(ctx, fn, audit?)`, which blocks `read_only`/`suspended` dealers and writes `audit_log` in the same transaction. Exceptions: self-service credential changes (see `## Decisions`); backoffice operator writes to dealer-scoped tables use `withBackofficeMutation` instead (`audit_log` in the same transaction, no `read_only`/`suspended` block, so operators can manage and reactivate restricted dealers).
5. Admin pages, layouts and server actions first call `requireDealerUser()` / `requireBackofficeUser()` (`src/server/auth/permissions.ts`). These read the surface's own session cookie and redirect to that surface's `/login` when there is no valid session. Role checks use `requireDealerRole(ctx, roles)` (Owner / Salesperson) and `requireBackofficeRole(roles)` (Superadmin / Support). They throw `ForbiddenError` when the session user lacks the role or, for dealer users, when the session's dealer is not `ctx.dealerId`.
6. Cross-tenant queries are backoffice-only and must call `requireBackofficeRole` first. Backoffice writes go through `withBackofficeMutation(fn, audit)` (`src/server/data/backoffice/mutate.ts`), which requires Superadmin and writes `audit_log` in the same transaction.
7. Public IDs (cars) are unguessable `newPublicId()` values, never sequential.
8. Reserved slugs (`RESERVED_SLUGS` in `src/lib/config.ts`) are never resolved as dealers.

## Routing
Host routing lives in `src/server/routing.ts` (pure, unit-tested) and is wired up by `src/proxy.ts`.
- `{slug}.{BASE_DOMAIN}` → rewrites to `/site/{slug}`
- `app.{BASE_DOMAIN}` → `/dealer-admin` · `admin.{BASE_DOMAIN}` → `/backoffice` (`/` is the surface home in the `(app)` route group, whose layout redirects to `/login` without a session; login and password pages stay outside `(app)`; the proxy always sets `x-drivebook-base-path` there — empty on `app.`/`admin.`, `/_dev/app` / `/_dev/admin` under the dev aliases — read via `getSurfaceBasePath()`)
- `/api/test/login` passes through untouched on `app.` and non-dealer hosts (dealer and `admin.` hosts 404 it)
- `/api/files/*` passes through untouched on every host, including dealer subdomains
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
- Dealer admin is desktop-first but must be usable on tablet/phone: `AppHeader` nav hides below `lg`; pass `menu={{ label }}` to show the same items in the compact disclosure menu (`CompactMenu`) there.

## Decisions
- Backoffice users are invited and deactivated by Superadmins on the backoffice users page (`admin.` surface, `src/app/backoffice/(app)/users`), and dealer Owner invitations are resent from the backoffice dealer detail page. `npm run user-admin` (deactivate / resend-invite) remains available for operators.
- Creating a dealer seeds default booking rules, Slovenian work-free days for the current and next year, and empty opening hours, and invites the Owner (7-day link) after the transaction commits.
- Support backoffice users can view everything; change controls are hidden and every write is refused server-side (Superadmin only).
- Old slugs stay reserved in slug history and cannot be taken by another dealer.
- Self-service credential changes (own password change, TOTP setup/enable/disable in `src/server/auth/account.ts`) are exempt from `withDealerMutation`'s read_only/suspended block, so users of a restricted dealer can still secure their accounts; they must still write `audit_log` in the same transaction.
- Session cookie renewal: `src/proxy.ts` re-issues the surface session cookie on `app.`/`admin.` requests (and on `/_dev/app/*`, `/_dev/admin/*`) once the session has passed `SESSION_REFRESH_AFTER_MS` since its last refresh. Page navigation alone therefore keeps the 30-day sliding expiry alive. Server Components never set cookies.
- TOTP codes are single-use. The last accepted time step is stored per user (`totp_last_step`). Codes at or before it are rejected at login, at 2FA setup confirmation and when 2FA is turned off.
- Account-page credential checks (the current password when changing the password; the password + code when turning 2FA off) count toward the same per-account failure limit and lockout as login. Every failed check is written to audit_log.
- Forgot password for an `invited` user (no password set yet) re-sends the invitation, under the same 3-per-hour per-account link cap. Deactivated users get nothing. The response is always the same generic message.
- Password-reset requests are also capped per client IP (via `clientIp`) per surface: 10 per hour, counted in `password_reset_requests`. Over the cap, no e-mail is sent and the usual generic message is shown.
- The startup seed only inserts the default plan (matched by `code`) when it is missing (`onConflictDoNothing`); operator edits to it in the backoffice are never overwritten on restart.
- Licence extension (`extendLicence`) refuses a valid-until date in the past (Europe/Ljubljana) or earlier than the dealer's current licence valid-until; extensions can never shorten a licence.
- Inviting the e-mail of a `deactivated` backoffice user re-invites that row (status back to `invited`, new 7-day set-password link, invitation e-mail, audit_log entry); active or invited users still get `taken`.
- The public dealer page hides the call button, the address block and the maps link while the dealer's phone / address are empty; the suspended message then drops the 'call us' wording.
- Holiday names are not hardcoded: `slovenianWorkFreeDays` (`src/lib/date.ts`) returns stable `key`s, and the Slovenian name comes from `messages/sl/holidays.json` by key.
- Public pages never render empty dealer contact data: every public page that shows the address or phone (dealer page, privacy page, and any later one) builds the address with `dealerAddress()` and switches to a translation variant without the address/phone when it is empty.
- A dealer's `legalName` starts equal to `name` (set by `createDealer`). The back-office rename (`updateDealer`) keeps `legalName` in step with `name` only while the two are still equal; once `legalName` differs it is never overwritten by a rename.
- Settings and Users pages and their server actions are Owner-only: Salespeople don't see the nav items, the pages render access denied, and actions are refused on the server.
- Dealer user invites, reactivations and plan limits: invited + active users count toward the plan's max users; deactivated users don't. The last active Owner can't be demoted or deactivated. Inviting the e-mail of a deactivated user of the same dealer re-invites that row.
- By-id dealer operations (users, closures, holidays) return not-found (HTTP 404) for ids of another dealer, never forbidden.
- Uploaded files use unique keys (`logos/<publicId>.<ext>`) and are served with `Cache-Control: public, max-age=31536000, immutable`; replacing a logo deletes the old file after commit. The logo type is detected from content; unsafe SVGs are rejected, and SVGs are served with a sandbox CSP.
- `isDealerClosed` covers holidays (unless marked open anyway for that year) and custom closures; weekdays with no opening ranges are handled by `getOpeningRangesForDate` returning [].
- The SMS sender name defaults to the dealer name with diacritics removed, limited to 11 letters/digits/spaces.
- Production refuses to start with fake SMS/e-mail providers unless ALLOW_FAKE_PROVIDERS=1 (staging only).
- `NextIntlClientProvider` is mounted only in the admin `(app)` layouts (dealer admin and backoffice), not in the root layout, so public pages ship no intl runtime or messages. Client components elsewhere receive translated strings as props.
