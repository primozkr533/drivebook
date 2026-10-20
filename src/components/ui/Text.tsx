import type { ElementType, HTMLAttributes, ReactNode } from "react";
import { cx } from "@/lib/cx";

type HeadingSize = "mega" | "d1" | "h1" | "h2" | "h3";

const headingSize: Record<HeadingSize, string> = {
  mega: "type-display text-mega uppercase",
  d1: "type-display text-d1 uppercase",
  h1: "type-display text-h1",
  h2: "font-body font-[750] text-h2",
  h3: "font-body font-[650] text-h3",
};

/**
 * Heading. `mega`/`d1`/`h1` use the expanded display register — spend them
 * sparingly (one per screen). h2/h3 are the working headings.
 */
export function Heading({
  as,
  size = "h2",
  className,
  children,
  ...rest
}: { as?: ElementType; size?: HeadingSize; children: ReactNode } & HTMLAttributes<HTMLElement>) {
  const Tag = as ?? (size === "mega" || size === "d1" ? "h1" : size);
  return (
    <Tag className={cx("text-ink text-balance", headingSize[size], className)} {...rest}>
      {children}
    </Tag>
  );
}

type Tone = "ink" | "ink-2" | "muted" | "signal" | "ok" | "warn" | "danger";
const tones: Record<Tone, string> = {
  ink: "text-ink",
  "ink-2": "text-ink-2",
  muted: "text-muted",
  signal: "text-signal-ink",
  ok: "text-ok",
  warn: "text-warn",
  danger: "text-danger",
};

export function Text({
  as: Tag = "p",
  size = "body",
  tone = "ink-2",
  className,
  children,
  ...rest
}: { as?: ElementType; size?: "lead" | "body" | "small"; tone?: Tone; children: ReactNode } & HTMLAttributes<HTMLElement>) {
  const sz = { lead: "text-lead", body: "text-body", small: "text-small" }[size];
  return (
    <Tag className={cx(sz, tones[tone], "text-pretty", className)} {...rest}>
      {children}
    </Tag>
  );
}

/** Utility register — mono, uppercase, tracked. Labels, meta, codes. */
export function Eyebrow({
  as: Tag = "span",
  tone = "muted",
  className,
  children,
}: { as?: ElementType; tone?: Tone; className?: string; children: ReactNode }) {
  return <Tag className={cx("type-utility", tones[tone], className)}>{children}</Tag>;
}

/** Numbered section marker: "01 — Barve". Replaces emoji/icon section markers. */
export function SectionMark({ index, children }: { index: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="type-utility text-signal-ink tabular">{index}</span>
      <span className="h-px w-8 translate-y-[-3px] bg-line-strong" aria-hidden />
      <span className="type-utility text-ink">{children}</span>
    </div>
  );
}
