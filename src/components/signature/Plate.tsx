import { cx } from "@/lib/cx";

/**
 * Plate — a dealer slug / code rendered as a Slovenian-style number plate.
 * Ink country strip + chamfered body. Used for slugs, booking codes, car ids.
 */
export function Plate({ children, country = "SLO", size = "md" }: { children: string; country?: string; size?: "sm" | "md" | "lg" }) {
  const s = {
    sm: "h-7 text-code",
    md: "h-9 text-[1rem]",
    lg: "h-14 text-[1.625rem]",
  }[size];
  return (
    <span
      className={cx(
        "cut-br inline-flex items-stretch bg-surface text-ink shadow-[inset_0_0_0_2px_var(--line-strong)]",
        s,
      )}
    >
      <span className="type-utility flex items-end bg-ink px-1.5 pb-1 text-[0.5625rem] leading-none text-ground">{country}</span>
      <span className="flex items-center px-3 pr-4 font-mono font-[700] uppercase tracking-[0.12em] tabular">{children}</span>
    </span>
  );
}
