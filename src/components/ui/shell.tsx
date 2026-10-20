import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Heading, Kicker } from "./text";

/* ── Layout primitives ────────────────────────────────────────────────────
 * Responsive rule: one full-width column on phones; from `lg` (1024px) use
 * the width — side-by-side and multi-column — inside a 1280px max container.
 * Never a phone-width column floating in empty desktop margins.           */

export function Container({
  className,
  width = "page",
  ...props
}: ComponentPropsWithoutRef<"div"> & { width?: "page" | "measure" | "narrow" }) {
  const max = { page: "max-w-page", measure: "max-w-measure", narrow: "max-w-narrow" }[width];
  return <div className={cn("mx-auto w-full px-gutter", max, className)} {...props} />;
}

type GridLayout = "halves" | "thirds" | "quarters" | "aside" | "lead" | "form";

const gridLayouts: Record<GridLayout, string> = {
  /** 1 → 2 columns */
  halves: "md:grid-cols-2",
  /** 1 → 2 → 3 columns (card grids) */
  thirds: "sm:grid-cols-2 lg:grid-cols-3",
  /** 2 → 4 columns (stats, swatches, colophons) */
  quarters: "grid-cols-2 lg:grid-cols-4",
  /** main + fixed sidebar (aside stacks below on mobile) */
  aside: "lg:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)]",
  /** narrow intro column + wide body — editorial section header */
  lead: "lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]",
  /** settings forms: label/description column + fields column */
  form: "md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]",
};

export function Grid({
  layout = "thirds",
  gap = "gutter",
  className,
  ...props
}: ComponentPropsWithoutRef<"div"> & { layout?: GridLayout; gap?: "gutter" | "tight" }) {
  return (
    <div
      className={cn("grid grid-cols-1", gridLayouts[layout], gap === "gutter" ? "gap-gutter" : "gap-4", className)}
      {...props}
    />
  );
}

/** Vertical rhythm block with an optional numbered editorial header. */
export function Section({
  index,
  kicker,
  title,
  intro,
  actions,
  className,
  children,
  ...props
}: Omit<ComponentPropsWithoutRef<"section">, "title"> & {
  index?: string;
  kicker?: ReactNode;
  title?: ReactNode;
  intro?: ReactNode;
  actions?: ReactNode;
}) {
  const hasHeader = kicker || title || intro || actions;
  return (
    <section className={cn("py-section", className)} {...props}>
      {hasHeader && (
        <header className="mb-10 grid grid-cols-1 gap-6 border-t-(length:--rule-heavy) border-rule pt-5 lg:mb-14 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-gutter">
          <div className="flex flex-col gap-4">
            {kicker && <Kicker index={index}>{kicker}</Kicker>}
            {title && <Heading size="2xl">{title}</Heading>}
          </div>
          {(intro || actions) && (
            <div className="flex flex-col justify-end gap-5 lg:pt-8">
              {intro && <div className="max-w-measure text-md text-ink-soft">{intro}</div>}
              {actions && <div className="flex flex-wrap gap-3">{actions}</div>}
            </div>
          )}
        </header>
      )}
      {children}
    </section>
  );
}

/* ── Wordmark ─────────────────────────────────────────────────────────── */

export function Wordmark({ className, size = "md" }: { className?: string; size?: "md" | "lg" }) {
  return (
    <span
      className={cn(
        "font-display leading-none tracking-tight text-ink",
        size === "lg" ? "text-xl" : "text-lg",
        className,
      )}
    >
      Drive<em className="font-[300] italic">Book</em>
    </span>
  );
}

/* ── AppShell ─ dealer admin (app.) and backoffice (admin.) ───────────────
 * Masthead bar: wordmark + surface label, horizontal nav (scrolls on phones),
 * account slot on the right. Content sits in the page Container.          */

export type NavItem = { href: string; label: ReactNode; active?: boolean };

export function AppShell({
  surfaceLabel,
  context,
  nav,
  account,
  children,
  className,
}: {
  /** "Trgovec" / "Zaledje" — which surface this is. */
  surfaceLabel: ReactNode;
  /** Current dealer name on app., environment on admin. */
  context?: ReactNode;
  nav: NavItem[];
  account?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-h-full flex-col bg-ground text-ink", className)}>
      <header className="border-b border-line bg-ground">
        <Container className="flex flex-wrap items-center gap-x-8 gap-y-3 pt-4 lg:flex-nowrap lg:py-0">
          <div className="flex items-baseline gap-3 lg:py-4">
            <Wordmark />
            <Kicker>{surfaceLabel}</Kicker>
          </div>
          {context && (
            <span className="hidden border-l border-line pl-6 text-sm font-semibold text-ink md:inline">{context}</span>
          )}
          <div className="ml-auto flex items-center gap-4 text-sm lg:order-last">{account}</div>
          <nav className="-mx-gutter w-[calc(100%+2*var(--spacing-gutter))] overflow-x-auto px-gutter lg:mx-0 lg:w-auto lg:px-0">
            <ul className="flex gap-6">
              {nav.map((item) => (
                <li key={item.href}>
                  <a
                    href={item.href}
                    aria-current={item.active ? "page" : undefined}
                    className={cn(
                      "flex h-12 items-center border-b-(length:--rule-heavy) text-sm font-semibold whitespace-nowrap transition-colors duration-(--duration-fast) lg:h-16",
                      item.active
                        ? "border-brand text-ink"
                        : "border-transparent text-muted hover:border-line hover:text-ink",
                    )}
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </Container>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
