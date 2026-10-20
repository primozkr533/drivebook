# DriveBook

Multi-tenant SaaS (drivebook.si) where Slovenian car dealers take test-drive and viewing bookings.
One Next.js (App Router, TypeScript strict) app serves three hosts: `{slug}.BASE_DOMAIN` (public dealer page),
`app.` (dealer admin), `admin.` (backoffice). Stack per the phase specs: Tailwind CSS v4, shadcn/ui, next-intl (`sl`),
PostgreSQL + Drizzle, pg-boss, Vitest, Playwright.

Current state: design foundation only (tokens, primitives, `/design` showcase). Feature tickets build on it.

## Commands

- `npm run dev` — dev server on http://localhost:3000 (showcase at `/design`)
- `npm run build` / `npm start` — production build (standalone output)
- `npm run typecheck`
- `docker compose up --build` — runs the app on port 3000, no `.env` needed

FARM-RUN-CONTRACT
```
web-service: web
web-port: 3000
preview-path: /design
```

## Design system

**Files**
- Tokens (single source of truth): `src/styles/tokens.css` — palette, type, spacing, layout widths, breakpoints, radii,
  shadows, motion. Imported once by `src/app/globals.css`.
- Primitives: `src/components/ui/` (import from `@/components/ui`) — `Button`/`ButtonLink`, `Field` + `Input`/`Textarea`/`Select`,
  `Card`, `Notice`, `Badge`, `Heading`, `Text`, `Kicker`, `Figure`, `Rule`, `TextLink`, `Segmented`, `CopyButton`,
  layout `Container`, `Grid`, `Section`, and the admin shell `AppShell` + `Wordmark`.
- Signature components: `src/components/signature/` — `DealerMasthead` (+ `DealerFooter`, `PhoneLink`, `MapLink`),
  `CarCard` (grid + `featured` spread for `?car=`), `CarImage`, `WeekHours`.
- Dealer branding: `src/lib/brand.ts` — `brandStyle(hex)` sets `--brand`/`--brand-ink` (auto-contrast text) on a subtree.
- Showcase: `/design` (`src/app/design/`) — static, no auth/data. Keep it updated when adding primitives.

**Aesthetic.** Editorial, magazine-like, light: each dealer gets its own *cover*. Cool paper ground (neutrals biased toward
blue), blue-black ink, and structure made of hairline and heavy ink rules instead of shadows or rounded boxes. Type does the
talking: Newsreader display serif used large and sparingly with an *italic register* for emphasis, Schibsted Grotesk for all
UI text, IBM Plex Mono small/uppercase/tracked for labels, captions, times and IDs. Boldness is spent in one place: the
registration-plate cobalt accent (primary button, focus, active nav, featured rule) — which on a dealer's public page is
replaced by the dealer's own brand colour. Square corners (cards 0, controls 2px). One motion moment: the masthead rule
draws in on load. Light (“day edition”) and dark (“night edition”) are both first-class via `light-dark()` tokens.

**Hard rules**
1. Use the tokens. Never hardcode colours, font sizes, spacing, radii, shadows or durations — use the Tailwind utilities
   generated from tokens (`bg-ground`, `text-ink`, `border-line`, `text-caption`, `rounded-hair`, `shadow-raise`,
   `px-gutter`, `py-section`, `max-w-page`) or `var(--…)`. Tailwind's default palette/radii/type sizes are removed on purpose:
   `bg-blue-500`, `rounded-lg`, `text-2xl`-from-defaults don't exist. Need a new value? Add a token to `tokens.css`.
2. Build screens from the primitives. New shared components **compose** primitives; they never restyle them with
   overriding classes. If a primitive lacks a variant, add the variant to the primitive.
3. Emphasis = `<em>` inside `Heading` (italic register), not colour or bold. Labels = `Kicker` / `Field` label (mono caps).
   Prices, years, times = `Figure` or `tabular-nums`.
4. One primary `Button` per view. Primary uses `brand`, so dealer pages re-skin via `brandStyle(dealer.primaryColor)` on the
   page wrapper — never pass dealer colours into individual components.
5. No user-facing strings inside primitives — they take labels as props (next-intl `t()` at the call site).
6. shadcn/ui components, when added, must map to the token aliases already defined (`background`, `primary`, `border`,
   `ring`, …) and be adjusted to square corners; no shadcn default theme CSS.
7. Status colours (`positive`/`caution`/`negative`) only carry meaning; never decorative.
8. Motion: use `--duration-*` and `--ease-*` tokens only (they collapse to 0 under `prefers-reduced-motion`). No new
   ambient animations.

**Responsive rule (adapt to width like you adapt to theme)**
- Breakpoints (tokens): `sm` 640, `md` 768, `lg` 1024, `xl` 1280.
- Every page sits in `Container` (max 1280px, fluid `gutter` padding). Phones: one full-width column. From `lg`: use the
  width — `Grid layout="aside"` (content + sidebar), `"thirds"` card grids, `"form"` (description + fields), `"lead"`.
- Never a phone-width column stranded in desktop margins; `Container width="narrow"` is only for auth forms/dialogs.
- Public dealer page is mobile-first and must work at 360px; admin is desktop-first but usable on tablet/phone
  (wide tables go in an `overflow-x-auto` wrapper; nav scrolls horizontally).
- Components that may render in narrow slots (e.g. `DealerMasthead`, `CarImage`) use container queries (`@container`).
