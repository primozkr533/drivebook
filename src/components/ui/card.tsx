import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "@/lib/cn";

/* Cards are square. Editorial structure comes from rules, not rounded boxes. */

type CardVariant = "surface" | "ruled" | "sunken" | "outline";
type CardPadding = "none" | "sm" | "md" | "lg";

const cardVariants: Record<CardVariant, string> = {
  /** Default container for forms and admin panels. */
  surface: "bg-surface border border-line",
  /** No box — a heavy ink rule on top, like a magazine column. */
  ruled: "border-t-(length:--rule-heavy) border-rule",
  /** Recessed areas: placeholders, empty states, code. */
  sunken: "bg-sunken",
  /** Hairline only, transparent — for lists on the ground. */
  outline: "border border-line",
};

const paddings: Record<CardPadding, string> = {
  none: "",
  sm: "p-4",
  md: "p-5 sm:p-6",
  lg: "p-6 sm:p-8 lg:p-10",
};

type CardProps = ComponentPropsWithoutRef<"div"> & {
  variant?: CardVariant;
  padding?: CardPadding;
  as?: "div" | "article" | "section" | "aside";
};

export function Card({ variant = "surface", padding = "md", as: Tag = "div", className, ...props }: CardProps) {
  const pad = variant === "ruled" ? cn(paddings[padding], "px-0 sm:px-0 lg:px-0") : paddings[padding];
  return <Tag className={cn("rounded-none", cardVariants[variant], pad, className)} {...props} />;
}

/* ── Notice ─ inline, non-blocking messages (auto-fill failed, suspended…) */

type NoticeTone = "info" | "positive" | "caution" | "negative";

const noticeTones: Record<NoticeTone, string> = {
  info: "bg-accent-soft border-accent",
  positive: "bg-positive-soft border-positive",
  caution: "bg-caution-soft border-caution",
  negative: "bg-negative-soft border-negative",
};

const noticeLabelTones: Record<NoticeTone, string> = {
  info: "text-accent",
  positive: "text-positive",
  caution: "text-caution",
  negative: "text-negative",
};

export function Notice({
  tone = "info",
  label,
  children,
  action,
  className,
}: {
  tone?: NoticeTone;
  label?: ReactNode;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tone === "negative" ? "alert" : "status"}
      className={cn(
        "flex flex-col gap-3 border-l-(length:--rule-brand) px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between",
        noticeTones[tone],
        className,
      )}
    >
      <div className="flex flex-col gap-1">
        {label && (
          <span
            className={cn(
              "font-utility text-caption font-medium uppercase tracking-utility",
              noticeLabelTones[tone],
            )}
          >
            {label}
          </span>
        )}
        <div className="text-sm text-ink">{children}</div>
      </div>
      {action}
    </div>
  );
}
