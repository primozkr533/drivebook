# Public dealer page performance

Target: the demo dealer's public page scores **≥ 90** for performance in a mobile Lighthouse run at 360 px.

## How to measure

Start the stack (`docker compose up --build`), then run Lighthouse against the demo dealer's subdomain:

```sh
npx lighthouse http://demo.drivebook.localhost:3000/ --form-factor=mobile --screen-emulation.width=360 --only-categories=performance
```

The same page through the dev alias (on any non-dealer host, e.g. a preview proxy):

```sh
npx lighthouse http://localhost:3000/_dev/site/demo --form-factor=mobile --screen-emulation.width=360 --only-categories=performance
```

Add `--view` to open the HTML report, or `--output=json --output-path=./lighthouse.json` to keep the numbers.

Lighthouse simulates a mid-range phone (4× CPU slowdown, slow 4G), so the score depends on how busy the
measuring machine is: run it a few times on an otherwise idle machine and take the median. The report's
`benchmarkIndex` (under *Runtime settings*) shows how fast the host was; below ~1000 the CPU throttling is
too pessimistic and Total Blocking Time is inflated.

## Measured score

Production build (`next build`, standalone server, `APP_ENV=development` for the `demo.drivebook.localhost`
host), Lighthouse 13.5, Chromium 156 headless, 2026-10-21, five runs with the command above:

| Run | Score | FCP | LCP | TBT | CLS | Speed Index |
| --- | ----- | --- | --- | --- | --- | ----------- |
| 1 | 89 | 1.1 s | 2.2 s | 390 ms | 0 | 1.3 s |
| 2 | 93 | 1.1 s | 2.1 s | 290 ms | 0 | 1.1 s |
| 3 | 92 | 1.1 s | 2.1 s | 300 ms | 0 | 1.1 s |
| 4 | 92 | 1.1 s | 2.1 s | 320 ms | 0 | 1.1 s |
| 5 | 90 | 1.1 s | 2.1 s | 370 ms | 0 | 1.1 s |

**Median: 92.** The remaining Total Blocking Time is Next.js/React's own client runtime booting
(about 140 KB of gzipped framework JavaScript); the page itself ships no client components.

## What keeps it fast

- **Fonts** (`src/app/fonts.ts`): Archivo and JetBrains Mono are self-hosted with `next/font/local` from
  one-file subsets in `src/fonts/` (Latin + Latin Extended-A; Archivo keeps the `wdth` axis for the 125 %
  display register and `wght` 400–800). `display: swap` with a size-adjusted Arial fallback; only Archivo,
  which the first viewport needs, is preloaded. `src/fonts/subset-font.py` rebuilds the files from the
  google/fonts sources.
- **No CLS from images** (`src/components/signature/CarCard.tsx`, `src/app/site/[slug]/page.tsx`): car photos
  sit in a fixed 16:10 box and carry `width`/`height`, `sizes` and `decoding="async"`; the first card loads
  eagerly with `fetchpriority="high"`, the rest are `loading="lazy"`. The logo has a fixed 256×64 box.
  `tests/e2e/dealer-page-mobile.spec.ts` checks this (and that nothing scrolls sideways) at 360 px.
- **No translation payload on public pages**: `NextIntlClientProvider` lives only in the admin `(app)`
  layouts, so public pages don't ship the intl runtime or the message catalogue.
- **One round of data reads**: the dealer slug is resolved once per request (shared by `generateMetadata` and
  the page via React `cache`), in parallel with the translations, and the hours/cars/closure reads run in
  parallel. The page is a Server Component rendered per request (it depends on the host and `?car=`).
