import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/cn";

type Tone = "neutral" | "ink" | "accent" | "positive" | "caution" | "negative";

const tones: Record<Tone, string> = {
  neutral: "border-line text-muted",
  ink: "border-rule bg-ink text-ground",
  accent: "border-accent bg-accent-soft text-accent-strong",
  positive: "border-positive/40 bg-positive-soft text-positive",
  caution: "border-caution/40 bg-caution-soft text-caution",
  negative: "border-negative/40 bg-negative-soft text-negative",
};

type BadgeProps = ComponentPropsWithoutRef<"span"> & {
  tone?: Tone;
  /** Square tag (default, data/status) or pill (filters, roles). */
  shape?: "tag" | "pill";
  dot?: boolean;
};

export function Badge({ tone = "neutral", shape = "tag", dot, className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 border px-2 font-utility text-caption font-medium uppercase leading-none tracking-utility whitespace-nowrap",
        shape === "pill" ? "rounded-pill px-2.5" : "rounded-none",
        tones[tone],
        className,
      )}
      {...props}
    >
      {dot && <span aria-hidden className="size-1.5 rounded-pill bg-current" />}
      {children}
    </span>
  );
}
