import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Container } from "./layout";

/** DriveBook wordmark: a sign-panel square + condensed name. */
export function Wordmark({ surface, className }: { surface?: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span aria-hidden className="grid size-7 place-items-center rounded-xs bg-primary text-primary-ink">
        <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 13 L8 3 L13 13" strokeLinejoin="round" />
          <path d="M8 13 V9" strokeLinecap="round" />
        </svg>
      </span>
      <span className="font-display text-h4 font-bold uppercase tracking-display text-ink leading-none">
        DriveBook
      </span>
      {surface ? (
        <span className="hidden sm:inline font-mono text-micro uppercase tracking-utility text-muted border-l border-line pl-2 ml-1">
          {surface}
        </span>
      ) : null}
    </span>
  );
}

export type NavItem = { href: string; label: string; current?: boolean };

/**
 * Admin screen shell (dealer admin on app., backoffice on admin.).
 * Sticky header with wordmark, primary nav (horizontal-scroll strip on
 * phones, inline from md), and a user slot. Content sits in a Container.
 */
export function AppShell({
  surface,
  nav,
  user,
  skipLabel,
  navLabel,
  children,
  containerSize = "default",
}: {
  /** e.g. dealer name on app., "Zaledje" on admin. */
  surface?: string;
  nav: NavItem[];
  user?: ReactNode;
  /** Translated "skip to content" label. */
  skipLabel: string;
  /** Translated accessible name for the nav landmark. */
  navLabel: string;
  children: ReactNode;
  containerSize?: "narrow" | "default" | "wide";
}) {
  return (
    <div className="min-h-full bg-ground">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:bg-surface-raised focus:px-3 focus:py-2 focus:rounded-sm focus:shadow-2"
      >
        {skipLabel}
      </a>
      <header className="sticky top-0 z-30 border-b border-line bg-[color-mix(in_oklab,var(--surface)_88%,transparent)] backdrop-blur-sm">
        <Container size="wide" className="flex h-[var(--header-h)] items-center gap-6">
          <Wordmark surface={surface} />
          <nav className="hidden md:flex items-stretch self-stretch gap-1" aria-label={navLabel}>
            {nav.map((item) => (
              <NavLink key={item.href} item={item} />
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">{user}</div>
        </Container>
        <nav className="md:hidden border-t border-line overflow-x-auto" aria-label={navLabel}>
          <Container size="wide" className="flex h-11 items-stretch gap-1">
            {nav.map((item) => (
              <NavLink key={item.href} item={item} />
            ))}
          </Container>
        </nav>
      </header>
      <main id="main" className="py-8 md:py-10">
        <Container size={containerSize}>{children}</Container>
      </main>
    </div>
  );
}

function NavLink({ item }: { item: NavItem }) {
  return (
    <a
      href={item.href}
      aria-current={item.current ? "page" : undefined}
      className={cn(
        "relative inline-flex items-center whitespace-nowrap px-3 text-small font-medium text-muted",
        "transition-colors duration-[var(--motion-fast)] hover:text-ink",
        "aria-[current=page]:text-ink",
        "after:absolute after:inset-x-3 after:bottom-0 after:h-[3px] after:bg-primary after:scale-x-0 after:origin-left",
        "after:transition-transform after:duration-[var(--motion-base)] aria-[current=page]:after:scale-x-100",
      )}
    >
      {item.label}
    </a>
  );
}
