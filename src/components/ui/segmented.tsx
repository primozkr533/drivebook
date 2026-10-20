import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Segmented filter (Aktivna / Neaktivna / Vsa). Links, so filters live in the URL. */
export function Segmented({
  items,
  label,
  className,
}: {
  items: { href: string; label: ReactNode; count?: number; active?: boolean }[];
  /** Accessible name, e.g. t("cars.filter") */
  label: string;
  className?: string;
}) {
  return (
    <nav aria-label={label} className={cn("inline-flex border border-line", className)}>
      {items.map((item) => (
        <a
          key={item.href}
          href={item.href}
          aria-current={item.active ? "true" : undefined}
          className={cn(
            "flex h-11 items-center gap-2 px-4 text-sm font-semibold transition-colors duration-(--duration-fast)",
            item.active ? "bg-ink text-ground" : "text-muted hover:text-ink",
          )}
        >
          {item.label}
          {item.count !== undefined && <span className="font-utility text-caption tabular-nums opacity-70">{item.count}</span>}
        </a>
      ))}
    </nav>
  );
}
