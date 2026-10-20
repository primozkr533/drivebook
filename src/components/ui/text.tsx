import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";
import { cn } from "@/lib/cn";

/* ── Heading ─────────────────────────────────────────────────────────────
 * The display serif. Wrap a word in <em> for the italic register — that is
 * the system's emphasis, never colour or bold.                           */

type HeadingSize = "display" | "3xl" | "2xl" | "xl" | "lg" | "md";

const headingSizes: Record<HeadingSize, string> = {
  display: "text-display tracking-display font-[380]",
  "3xl": "text-3xl tracking-display font-[400]",
  "2xl": "text-2xl tracking-display font-[420]",
  xl: "text-xl tracking-tight font-[460]",
  lg: "text-lg tracking-tight font-[500]",
  md: "text-md font-[560]",
};

type HeadingProps = ComponentPropsWithoutRef<"h2"> & {
  as?: "h1" | "h2" | "h3" | "h4" | "p" | "span";
  size?: HeadingSize;
};

export function Heading({ as: Tag = "h2", size = "2xl", className, ...props }: HeadingProps) {
  return (
    <Tag
      className={cn(
        "font-display text-ink [&_em]:font-[300] [&_em]:italic",
        headingSizes[size],
        className,
      )}
      {...props}
    />
  );
}

/* ── Text ──────────────────────────────────────────────────────────────── */

type TextProps = ComponentPropsWithoutRef<"p"> & {
  as?: ElementType;
  size?: "lg" | "md" | "base" | "sm" | "xs";
  tone?: "ink" | "soft" | "muted";
  /** Cap line length at the reading measure. */
  measure?: boolean;
};

const textSizes = { lg: "text-lg", md: "text-md", base: "text-base", sm: "text-sm", xs: "text-xs" };
const textTones = { ink: "text-ink", soft: "text-ink-soft", muted: "text-muted" };

export function Text({ as: Tag = "p", size = "base", tone = "soft", measure, className, ...props }: TextProps) {
  return (
    <Tag
      className={cn(textSizes[size], textTones[tone], measure && "max-w-measure", className)}
      {...props}
    />
  );
}

/* ── Kicker ────────────────────────────────────────────────────────────────
 * The utility face: small, uppercase, tracked mono. Section labels, field
 * labels, data captions. Optional running number ("01") like a magazine. */

type KickerProps = ComponentPropsWithoutRef<"span"> & {
  index?: string;
  tone?: "muted" | "ink" | "brand";
};

const kickerTones = { muted: "text-muted", ink: "text-ink", brand: "text-brand" };

export function Kicker({ index, tone = "muted", className, children, ...props }: KickerProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 font-utility text-caption font-medium uppercase tracking-utility",
        kickerTones[tone],
        className,
      )}
      {...props}
    >
      {index && <span className="text-ink tabular-nums">{index}</span>}
      {index && <span aria-hidden className="h-px w-5 bg-current opacity-50" />}
      <span>{children}</span>
    </span>
  );
}

/* ── Figure ─ numbers that matter: prices, counts, times. ─────────────── */

const figureSizes = { lg: "text-lg", xl: "text-xl", "2xl": "text-2xl" };

export function Figure({
  className,
  size = "xl",
  ...props
}: ComponentPropsWithoutRef<"span"> & { size?: "lg" | "xl" | "2xl" }) {
  return (
    <span
      className={cn("font-display tracking-tight text-ink tabular-nums lining-nums font-[440]", figureSizes[size], className)}
      {...props}
    />
  );
}

/* ── Rule ─ the editorial divider. ─────────────────────────────────────── */

type RuleProps = { weight?: "hair" | "ink" | "heavy" | "brand"; className?: string; draw?: boolean };

const ruleWeights = {
  hair: "h-(--rule-hair) bg-line",
  ink: "h-(--rule-hair) bg-rule",
  heavy: "h-(--rule-heavy) bg-rule",
  brand: "h-(--rule-brand) bg-brand",
};

export function Rule({ weight = "hair", draw, className }: RuleProps) {
  return (
    <div
      role="separator"
      className={cn("w-full origin-left", ruleWeights[weight], draw && "animate-rule-draw", className)}
    />
  );
}

/* ── TextLink ─ inline links: underline offset, accent on hover. ───────── */

export function TextLink({
  className,
  external,
  children,
  ...props
}: ComponentPropsWithoutRef<"a"> & { external?: boolean; children: ReactNode }) {
  return (
    <a
      className={cn(
        "underline decoration-line decoration-1 underline-offset-[0.22em] transition-colors duration-(--duration-fast) hover:text-brand hover:decoration-current",
        className,
      )}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      {...props}
    >
      {children}
      {external && (
        <span aria-hidden className="ml-0.5 inline-block font-utility text-[0.85em]">
          ↗
        </span>
      )}
    </a>
  );
}
