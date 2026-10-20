import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "@/lib/cx";

type Variant = "primary" | "secondary" | "quiet" | "brand" | "danger";
type Size = "sm" | "md" | "lg";

const base =
  "group/btn inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-soft font-body font-[650] " +
  "transition-[transform,box-shadow,background-color,color] duration-[var(--dur-fast)] ease-out " +
  "disabled:pointer-events-none disabled:opacity-45 select-none";

const variants: Record<Variant, string> = {
  // The one loud move: signal fill, ink text, lifts onto a hard ink shadow.
  primary:
    "bg-signal text-on-signal hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-hard active:translate-x-0 active:translate-y-0 active:shadow-none",
  // Dealer-branded twin of primary (public booking page only).
  brand:
    "bg-brand text-on-brand hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-hard active:translate-x-0 active:translate-y-0 active:shadow-none",
  secondary:
    "bg-transparent text-ink shadow-[inset_0_0_0_1.5px_var(--line-strong)] hover:bg-ink hover:text-ground",
  quiet:
    "bg-transparent text-ink underline decoration-line decoration-2 underline-offset-[6px] hover:decoration-signal hover:text-signal-ink px-0!",
  danger:
    "bg-transparent text-danger shadow-[inset_0_0_0_1.5px_var(--danger)] hover:bg-danger hover:text-surface",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-small",
  md: "h-11 px-5 text-body",
  lg: "h-14 px-7 text-lead",
};

type Common = { variant?: Variant; size?: Size; icon?: ReactNode; trailing?: ReactNode; className?: string };

export type ButtonProps = Common & ButtonHTMLAttributes<HTMLButtonElement>;
export type ButtonLinkProps = Common & AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };

export function buttonClass({ variant = "primary", size = "md", className }: Common = {}) {
  return cx(base, variants[variant], sizes[size], className);
}

export function Button({ variant, size, icon, trailing, className, children, type = "button", ...rest }: ButtonProps) {
  return (
    <button type={type} className={buttonClass({ variant, size, className })} {...rest}>
      {icon}
      {children}
      {trailing}
    </button>
  );
}

export function ButtonLink({ variant, size, icon, trailing, className, children, ...rest }: ButtonLinkProps) {
  return (
    <a className={buttonClass({ variant, size, className })} {...rest}>
      {icon}
      {children}
      {trailing}
    </a>
  );
}

/** Geometric arrow used as a trailing glyph; nudges on hover. */
export function Arrow({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      className={cx("size-4 transition-transform duration-[var(--dur-base)] ease-out group-hover/btn:translate-x-0.5", className)}
    >
      <path d="M1 8h11M8 3l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" />
    </svg>
  );
}
