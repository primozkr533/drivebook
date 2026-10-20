import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "@/lib/cx";

type Tone = "surface" | "sunken" | "ink" | "signal";

const tones: Record<Tone, string> = {
  surface: "bg-surface shadow-[inset_0_0_0_1px_var(--line)]",
  sunken: "bg-surface-2",
  ink: "bg-ink text-ground",
  signal: "bg-signal text-on-signal",
};

/**
 * Card — sharp rectangle on a hairline. No rounded-lg, no blur shadow.
 * `cut` adds the plate chamfer (reserve for featured/signature moments).
 * `selected` draws the bold signal frame used for "the chosen one".
 */
export function Card({
  tone = "surface",
  cut = false,
  selected = false,
  pad = "md",
  className,
  children,
  ...rest
}: {
  tone?: Tone;
  cut?: boolean;
  selected?: boolean;
  pad?: "none" | "sm" | "md" | "lg";
  children: ReactNode;
} & HTMLAttributes<HTMLDivElement>) {
  const p = { none: "", sm: "p-4", md: "p-5 md:p-6", lg: "p-6 md:p-8" }[pad];
  return (
    <div
      className={cx(
        "relative",
        tones[tone],
        selected && "shadow-[inset_0_0_0_2px_var(--signal)]",
        cut && "cut-tr",
        p,
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

/** Card header row: title left, meta/actions right, hairline under. */
export function CardHeader({ title, meta, children }: { title: ReactNode; meta?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-5 flex items-start justify-between gap-4 border-b border-line pb-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-h3 font-[650] text-ink">{title}</h3>
        {children}
      </div>
      {meta}
    </div>
  );
}

/** Key/value stat used in admin cards. */
export function Stat({ label, value, note }: { label: string; value: ReactNode; note?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-l-2 border-line-strong pl-4">
      <span className="type-utility text-muted">{label}</span>
      <span className="type-display text-h1 tabular text-ink">{value}</span>
      {note && <span className="text-small text-muted">{note}</span>}
    </div>
  );
}
