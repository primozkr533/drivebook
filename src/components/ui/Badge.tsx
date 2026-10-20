import type { ReactNode } from "react";
import { cx } from "@/lib/cx";

type Tone = "neutral" | "signal" | "ok" | "warn" | "danger" | "ink";

const tones: Record<Tone, string> = {
  neutral: "bg-surface-2 text-ink-2",
  signal: "bg-signal-wash text-signal-ink",
  ok: "bg-ok-wash text-ok",
  warn: "bg-warn-wash text-warn",
  danger: "bg-danger-wash text-danger",
  ink: "bg-ink text-ground",
};

/** Status badge — square-cornered tag with a status block. */
export function Badge({ tone = "neutral", dot = true, children }: { tone?: Tone; dot?: boolean; children: ReactNode }) {
  return (
    <span className={cx("type-utility inline-flex h-6 items-center gap-1.5 rounded-sharp px-2", tones[tone])}>
      {dot && <span aria-hidden className="size-1.5 bg-current" />}
      {children}
    </span>
  );
}

/** Pill — filter chips / counts. The only fully rounded shape in the system. */
export function Pill({ active = false, count, children }: { active?: boolean; count?: number; children: ReactNode }) {
  return (
    <span
      className={cx(
        "inline-flex h-8 items-center gap-2 rounded-pill px-3.5 text-small font-[600] transition-colors duration-[var(--dur-fast)]",
        active ? "bg-ink text-ground" : "bg-transparent text-ink shadow-[inset_0_0_0_1px_var(--line)] hover:shadow-[inset_0_0_0_1px_var(--ink)]",
      )}
    >
      {children}
      {count !== undefined && <span className={cx("tabular type-utility", active ? "text-ground" : "text-muted")}>{count}</span>}
    </span>
  );
}
