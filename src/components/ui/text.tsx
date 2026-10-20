import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

/* Display face (Barlow Condensed) is for headings only — the sign panel.
   Body face (IBM Plex Sans) for everything read. Mono for the utility register. */

const headingVariants = cva("font-display text-ink tracking-display text-balance", {
  variants: {
    size: {
      display: "text-[length:clamp(2.75rem,7vw,var(--type-display))] leading-tight font-semibold",
      h1: "text-[length:clamp(2rem,4.5vw,var(--type-h1))] leading-tight font-semibold",
      h2: "text-h2 leading-snug font-semibold",
      h3: "text-h3 leading-snug font-semibold",
      h4: "text-h4 leading-snug font-semibold",
    },
  },
  defaultVariants: { size: "h2" },
});

type HeadingTag = "h1" | "h2" | "h3" | "h4" | "p" | "div";

export function Heading({
  as: Tag = "h2",
  size,
  className,
  ...props
}: HTMLAttributes<HTMLHeadingElement> & VariantProps<typeof headingVariants> & { as?: HeadingTag }) {
  return <Tag className={cn(headingVariants({ size }), className)} {...props} />;
}

const textVariants = cva("font-body", {
  variants: {
    size: {
      lead: "text-lead leading-body",
      body: "text-body leading-body",
      small: "text-small leading-body",
      caption: "text-caption leading-snug",
    },
    tone: {
      default: "text-ink-soft",
      strong: "text-ink",
      muted: "text-muted",
      primary: "text-primary-strong",
      danger: "text-danger",
      warn: "text-warn",
    },
    weight: { regular: "font-normal", medium: "font-medium", semibold: "font-semibold" },
  },
  defaultVariants: { size: "body", tone: "default", weight: "regular" },
});

export function Text({
  as: Tag = "p",
  size,
  tone,
  weight,
  className,
  ...props
}: HTMLAttributes<HTMLElement> & VariantProps<typeof textVariants> & { as?: "p" | "span" | "div" | "dd" | "dt" }) {
  return <Tag className={cn(textVariants({ size, tone, weight }), className)} {...props} />;
}

/** Small uppercase letter-spaced utility label — section kickers, table heads, meta. */
export function Eyebrow({ className, children, ...props }: HTMLAttributes<HTMLSpanElement> & { children: ReactNode }) {
  return (
    <span
      className={cn("font-mono text-micro font-medium uppercase tracking-utility text-muted", className)}
      {...props}
    >
      {children}
    </span>
  );
}

/** Times, prices, IDs, slugs: mono + tabular figures. */
export function Mono({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("font-mono tabular", className)} {...props} />;
}
