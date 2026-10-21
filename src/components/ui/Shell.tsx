import type { ElementType, ReactNode } from "react";
import { cx } from "@/lib/cx";
import { CompactMenu } from "./CompactMenu";

/**
 * Layout primitives. EVERY screen is: <Shell header={…}> → <Container> → <Grid>/<Stack>.
 * Breakpoints are Tailwind's (sm 640 · md 768 · lg 1024 · xl 1280). Phones get a single
 * full-width column; from md up, use the width — never a phone column in desktop margins.
 */

export function Container({
  as: Tag = "div",
  width = "page",
  className,
  children,
}: {
  as?: ElementType;
  width?: "page" | "narrow" | "full";
  className?: string;
  children: ReactNode;
}) {
  const max = { page: "max-w-page", narrow: "max-w-narrow", full: "" }[width];
  return <Tag className={cx("mx-auto w-full px-[var(--gutter)]", max, className)}>{children}</Tag>;
}

/** Responsive column grid: 1 col on phones → `cols` from the given breakpoint. */
export function Grid({
  cols = 2,
  from = "md",
  gap = "md",
  className,
  children,
}: {
  cols?: 2 | 3 | 4 | 12;
  from?: "sm" | "md" | "lg";
  gap?: "sm" | "md" | "lg";
  className?: string;
  children: ReactNode;
}) {
  const colMap = {
    sm: { 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "sm:grid-cols-4", 12: "sm:grid-cols-12" },
    md: { 2: "md:grid-cols-2", 3: "md:grid-cols-3", 4: "md:grid-cols-4", 12: "md:grid-cols-12" },
    lg: { 2: "lg:grid-cols-2", 3: "lg:grid-cols-3", 4: "lg:grid-cols-4", 12: "lg:grid-cols-12" },
  } as const;
  const g = { sm: "gap-3", md: "gap-5 lg:gap-6", lg: "gap-8 lg:gap-12" }[gap];
  return <div className={cx("grid grid-cols-1", colMap[from][cols], g, className)}>{children}</div>;
}

export function Stack({ gap = 4, className, children }: { gap?: 2 | 3 | 4 | 6 | 8; className?: string; children: ReactNode }) {
  const g = { 2: "gap-2", 3: "gap-3", 4: "gap-4", 6: "gap-6", 8: "gap-8" }[gap];
  return <div className={cx("flex flex-col", g, className)}>{children}</div>;
}

/** DriveBook wordmark: chamfered signal block + expanded caps. */
export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5 text-ink">
      <span aria-hidden className="cut-tr grid size-7 place-items-center bg-signal text-on-signal">
        <svg viewBox="0 0 16 16" className="size-3.5">
          <path d="M3 2h6l4 4v8H3z" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinejoin="miter" />
          <path d="M6 7h4M6 10.5h4" stroke="currentColor" strokeWidth="2" />
        </svg>
      </span>
      {!compact && <span className="type-display text-[1.0625rem] uppercase tracking-[-0.01em]">DriveBook</span>}
    </span>
  );
}

export type NavItem = { label: string; href: string; active?: boolean };

/**
 * Top bar: logo · context · nav · actions. Hairline-ruled, sticky. The inline nav hides below
 * `lg`; pass `menu` to show the same items in a compact disclosure menu there instead.
 */
export function AppHeader({
  context,
  nav = [],
  actions,
  menu,
}: {
  context?: ReactNode;
  nav?: NavItem[];
  actions?: ReactNode;
  menu?: { label: string; footer?: ReactNode };
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-line-strong bg-ground/95 backdrop-blur-sm">
      <Container className="flex h-[var(--header-h)] items-center gap-6">
        <Logo />
        {context && (
          <span className="hidden items-center gap-3 sm:flex">
            <span aria-hidden className="h-5 w-px bg-line" />
            {context}
          </span>
        )}
        <nav className="ml-auto hidden items-center gap-1 lg:flex" aria-label="Glavna navigacija">
          {nav.map((item) => (
            <a
              key={item.href}
              href={item.href}
              aria-current={item.active ? "page" : undefined}
              className={cx(
                "relative px-3 py-2 text-small font-[600] text-ink-2 hover:text-ink",
                "after:absolute after:inset-x-3 after:-bottom-[calc((var(--header-h)-2.25rem)/2)] after:h-[3px] after:bg-signal after:scale-x-0 after:transition-transform after:duration-[var(--dur-base)]",
                item.active ? "text-ink after:scale-x-100" : "hover:after:scale-x-50",
              )}
            >
              {item.label}
            </a>
          ))}
        </nav>
        {actions && <div className={cx("ml-auto flex items-center gap-2", nav.length > 0 && "lg:ml-0")}>{actions}</div>}
        {menu && nav.length > 0 && (
          <CompactMenu label={menu.label} nav={nav} footer={menu.footer} className={actions ? undefined : "ml-auto"} />
        )}
      </Container>
    </header>
  );
}

/** Page shell: header + main + optional footer. */
export function Shell({ header, footer, children }: { header?: ReactNode; footer?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-ground">
      {header}
      <main className="flex-1">{children}</main>
      {footer}
    </div>
  );
}

/** Page title block: eyebrow, title, description, actions — left-aligned, never centred. */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5 border-b border-line-strong pb-6 md:flex-row md:items-end md:justify-between">
      <div className="flex max-w-3xl flex-col gap-3">
        {eyebrow && <span className="type-utility text-muted">{eyebrow}</span>}
        <h1 className="type-display text-h1 text-ink text-balance">{title}</h1>
        {description && <p className="text-lead text-ink-2 text-pretty">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
