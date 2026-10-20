import { cva, type VariantProps } from "class-variance-authority";
import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

/*
 * Responsive layout primitives — every screen is composed from these.
 * Mobile-first: one full-width column under md (48rem); from md/lg up the
 * horizontal space is USED (Split, Grid) inside a capped Container.
 */

const containerVariants = cva("mx-auto w-full px-[var(--gutter)]", {
  variants: {
    size: {
      narrow: "max-w-narrow", // forms, auth, single-column settings
      default: "max-w-default", // admin pages, public dealer page
      wide: "max-w-wide", // tables, showcase
      full: "",
    },
  },
  defaultVariants: { size: "default" },
});

export function Container({
  className,
  size,
  ...props
}: HTMLAttributes<HTMLDivElement> & VariantProps<typeof containerVariants>) {
  return <div className={cn(containerVariants({ size }), className)} {...props} />;
}

const gapMap = { 1: "gap-1", 2: "gap-2", 3: "gap-3", 4: "gap-4", 6: "gap-6", 8: "gap-8", 12: "gap-12" } as const;
type Gap = keyof typeof gapMap;

/** Vertical rhythm. */
export function Stack({ gap = 4, className, ...props }: HTMLAttributes<HTMLDivElement> & { gap?: Gap }) {
  return <div className={cn("flex flex-col", gapMap[gap], className)} {...props} />;
}

/** Horizontal group that wraps on narrow screens. */
export function Cluster({
  gap = 3,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { gap?: Gap }) {
  return <div className={cn("flex flex-wrap items-center", gapMap[gap], className)} {...props} />;
}

const gridVariants = cva("grid", {
  variants: {
    cols: {
      /** Cards: 1 col phone → 2 tablet → 3 desktop. */
      cards: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
      /** Dense tiles: auto-fill, min 15rem. */
      tiles: "grid-cols-[repeat(auto-fill,minmax(15rem,1fr))]",
      /** Two equal columns from md. */
      halves: "grid-cols-1 md:grid-cols-2",
      /** Form rows: label-ish pairs side by side from sm. */
      form: "grid-cols-1 sm:grid-cols-2",
    },
  },
  defaultVariants: { cols: "cards" },
});

export function Grid({
  gap = 4,
  cols,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & VariantProps<typeof gridVariants> & { gap?: Gap }) {
  return <div className={cn(gridVariants({ cols }), gapMap[gap], className)} {...props} />;
}

/**
 * Main + aside. Stacks on phones (aside first or last), sits side by side
 * from lg with a fixed-width aside. The workhorse for detail/settings pages
 * and the public dealer page.
 */
export function Split({
  aside,
  asideFirst = false,
  asideWidth = "20rem",
  className,
  children,
}: {
  aside: ReactNode;
  asideFirst?: boolean;
  asideWidth?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn("grid grid-cols-1 gap-6 lg:gap-10 lg:grid-cols-[minmax(0,1fr)_var(--aside-w)]", className)}
      style={{ "--aside-w": asideWidth } as CSSProperties}
    >
      <div className={cn("min-w-0", asideFirst && "order-2 lg:order-1")}>{children}</div>
      <aside className={cn("min-w-0", asideFirst && "order-1 lg:order-2")}>{aside}</aside>
    </div>
  );
}

/** Page title block: eyebrow, title, description, actions (wrap under on phones). */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-col gap-4 md:flex-row md:items-end md:justify-between pb-6 border-b border-line", className)}>
      <div className="flex flex-col gap-2 min-w-0">
        {eyebrow ? (
          <span className="font-mono text-micro font-medium uppercase tracking-utility text-muted">{eyebrow}</span>
        ) : null}
        <h1 className="font-display text-[length:clamp(1.75rem,3.5vw,var(--type-h1))] leading-tight font-semibold tracking-display text-ink">
          {title}
        </h1>
        {description ? <p className="max-w-[60ch] text-body text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2 shrink-0">{actions}</div> : null}
    </header>
  );
}
