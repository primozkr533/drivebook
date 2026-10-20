import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const badgeVariants = cva("inline-flex items-center gap-1.5 whitespace-nowrap border", {
  variants: {
    tone: {
      neutral: "bg-surface-sunk text-ink-soft border-line",
      primary: "bg-primary-soft text-primary-strong border-transparent",
      warn: "bg-warn-soft text-warn border-transparent",
      danger: "bg-danger-soft text-danger border-transparent",
      info: "bg-info-soft text-info border-transparent",
      solid: "bg-ink text-surface border-ink",
    },
    /** badge = squared sign tab (mono caps, for states/codes); pill = soft rounded (counts, filters). */
    shape: {
      badge: "rounded-xs px-1.5 h-5 font-mono text-micro font-medium uppercase tracking-utility",
      pill: "rounded-pill px-2.5 h-6 font-body text-caption font-medium",
    },
  },
  defaultVariants: { tone: "neutral", shape: "badge" },
});

export function Badge({
  className,
  tone,
  shape,
  dot,
  children,
  ...props
}: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants> & { dot?: boolean }) {
  return (
    <span className={cn(badgeVariants({ tone, shape }), className)} {...props}>
      {dot ? <span aria-hidden className="size-1.5 rounded-pill bg-current" /> : null}
      {children}
    </span>
  );
}
