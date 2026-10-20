import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const cardVariants = cva("rounded-md text-ink-soft", {
  variants: {
    variant: {
      /** Default container for content blocks. */
      plain: "bg-surface border border-line",
      /** Floats above the ground: dialogs, highlighted items. */
      raised: "bg-surface-raised border border-line shadow-2",
      /** Recessed well: grouped settings, empty states, placeholders. */
      sunk: "bg-surface-sunk border border-transparent",
      /** Dashed outline: "coming here" placeholders and drop zones. */
      outline: "bg-transparent border border-dashed border-line-strong",
    },
    pad: { none: "", sm: "p-4", md: "p-5 md:p-6", lg: "p-6 md:p-8" },
  },
  defaultVariants: { variant: "plain", pad: "md" },
});

export function Card({
  className,
  variant,
  pad,
  ...props
}: HTMLAttributes<HTMLDivElement> & VariantProps<typeof cardVariants>) {
  return <div className={cn(cardVariants({ variant, pad }), className)} {...props} />;
}

/** Header row inside a Card: title left, actions right, hairline below. */
export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4 mb-4", className)}
      {...props}
    />
  );
}
