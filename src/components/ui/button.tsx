import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "quiet";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap font-body font-semibold " +
  "transition-[background-color,color,border-color,transform] duration-(--duration-fast) ease-out " +
  "disabled:pointer-events-none disabled:opacity-45 active:translate-y-px";

const variants: Record<Variant, string> = {
  // The one saturated move. Uses `brand`, so on a dealer page it wears the dealer's colour.
  primary:
    "rounded-hair bg-brand text-brand-ink hover:bg-[color-mix(in_oklab,var(--color-brand)_86%,var(--color-rule))]",
  secondary:
    "rounded-hair border border-rule bg-transparent text-ink hover:bg-ink hover:text-ground",
  quiet:
    "rounded-hair text-ink underline decoration-line decoration-1 underline-offset-[0.3em] hover:text-brand hover:decoration-current",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-11 px-5 text-sm",
  lg: "h-14 px-7 text-base",
};

// Quiet buttons are text — no box padding, same height for alignment.
const quietSizes: Record<Size, string> = { sm: "h-8 px-0 text-sm", md: "h-11 px-0 text-sm", lg: "h-14 px-0 text-base" };

type ButtonProps = ComponentPropsWithoutRef<"button"> & { variant?: Variant; size?: Size };

export function buttonClasses({ variant = "primary", size = "md" }: { variant?: Variant; size?: Size } = {}) {
  return cn(base, variants[variant], variant === "quiet" ? quietSizes[size] : sizes[size]);
}

export function Button({ variant = "primary", size = "md", className, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={cn(buttonClasses({ variant, size }), className)} {...props} />;
}

/** An <a> that looks like a Button. */
export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentPropsWithoutRef<"a"> & { variant?: Variant; size?: Size }) {
  return <a className={cn(buttonClasses({ variant, size }), className)} {...props} />;
}
