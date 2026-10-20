import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap select-none",
    "font-body font-semibold rounded-sm border",
    "transition-[background-color,border-color,color,box-shadow,transform] duration-[var(--motion-fast)] ease-out",
    "active:translate-y-px disabled:pointer-events-none disabled:opacity-45",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
  ],
  {
    variants: {
      variant: {
        /** The one loud action per view. */
        primary:
          "bg-primary text-primary-ink border-primary shadow-1 hover:bg-primary-strong hover:border-primary-strong",
        /** Supporting actions. */
        secondary:
          "bg-surface-raised text-ink border-line-strong hover:border-ink hover:bg-surface",
        /** Tertiary / inline actions: no chrome until hover. */
        quiet:
          "bg-transparent text-ink-soft border-transparent hover:bg-surface-sunk hover:text-ink",
        /** Destructive confirmations only. */
        danger: "bg-danger text-surface border-danger hover:opacity-90",
        /** Public booking page: wears the dealer's colour. */
        brand:
          "bg-brand text-brand-ink border-brand shadow-1 hover:[background-color:color-mix(in_oklab,var(--brand)_86%,black)]",
      },
      size: {
        sm: "h-8 px-3 text-small",
        md: "h-10 px-4 text-body",
        lg: "h-12 px-6 text-lead",
        icon: "h-10 w-10 p-0",
      },
      block: { true: "w-full" },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>;

export function Button({ className, variant, size, block, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={cn(buttonVariants({ variant, size, block }), className)} {...props} />;
}
