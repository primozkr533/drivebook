# DriveBook — project conventions

Multi-tenant SaaS (drivebook.si) for Slovenian car dealers: test-drive / viewing bookings from avto.net listings.
Stack: Next.js (App Router, TypeScript strict) · Tailwind CSS v4 · shadcn/ui · next-intl (sl) · PostgreSQL + Drizzle · pg-boss.
Currently only the design foundation exists; phase 1 features build on top of it.

## Commands
- `docker compose up --build` — serves the app on http://localhost:3000 (`/` → `/design` for now)
- `npm run dev` — local dev server · `npm run build` — production build · `npm run typecheck`

FARM-RUN-CONTRACT
```
web-service: web
web-port: 3000
preview-path: /design
```

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
6. shadcn/ui components added later inherit via the alias variables in `tokens.css` (`--background`, `--primary`, `--ring`…); after `npx shadcn add`, replace any `rounded-md`/default classes with token utilities.
7. Text: all user-facing strings come from next-intl translation files in feature code (the `/design` specimen content in `src/app/design/content.ts` is the only exception). Times/dates are pre-formatted for Europe/Ljubljana by the date utility and passed into components — components never read the clock.
8. Accessibility: keep the `:focus-visible` ring (`--focus-ring`), text contrast ≥ 4.5:1 (use `signal-ink`, not `signal`, for orange TEXT), real labels on every field (`Input label=…`).

**Responsive rules (system-level — don't re-decide per screen)**
- Breakpoints are Tailwind defaults: `sm` 640 · `md` 768 · `lg` 1024 · `xl` 1280. Design mobile-first (public page at 360 px), then USE the width.
- Content width: `Container` (`--container-max` 1248 px, fluid `--gutter`); `width="narrow"` (704 px) only for single forms/reading. Never strand a phone-width column on desktop.
- Phones: one full-width column. From `md`/`lg`: multi-column via `Grid` (e.g. list + detail, cards 2–3 up, a `lg:col-span-8` main + `lg:col-span-4` aside).
- Components that can live in both a main column and an aside (`DriveTicket`, `HoursStrip`) respond to their **container** (`@container`, `@md:`/`@2xl:`), not the viewport. Do the same for new signature-level components.
- Dealer admin is desktop-first but must be usable on tablet/phone: `AppHeader` nav hides below `lg`; add a compact menu when real navigation exists.
