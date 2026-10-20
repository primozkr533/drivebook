import { cx } from "@/lib/cx";

/** Geometric side-profile placeholder for cars without an image. */
export function CarSilhouette({ className, body = "estate" }: { className?: string; body?: "estate" | "sedan" | "suv" }) {
  const roof = {
    estate: "M18 78 L28 60 L70 54 L98 34 L192 34 L208 54 L224 60 L226 78 Z",
    sedan: "M18 78 L28 60 L72 54 L104 34 L160 34 L190 54 L224 60 L226 78 Z",
    suv: "M18 78 L24 52 L62 48 L88 26 L196 26 L210 48 L224 52 L226 78 Z",
  }[body];
  return (
    <svg viewBox="0 0 244 112" aria-hidden className={cx("text-ink", className)}>
      <path d="M0 100 H244" stroke="var(--line)" strokeWidth="2" />
      <path d="M8 100 H40 M56 100 H88 M104 100 H136 M152 100 H184 M200 100 H232" stroke="var(--muted)" strokeWidth="2" />
      <path d={roof} fill="var(--surface)" stroke="currentColor" strokeWidth="3" strokeLinejoin="miter" />
      <path d="M78 54 L100 38 H140 V54 Z M148 54 V38 H188 L200 54 Z" fill="var(--surface-2)" stroke="currentColor" strokeWidth="2" />
      {[64, 182].map((cx_) => (
        <g key={cx_}>
          <circle cx={cx_} cy={80} r={17} fill="var(--ink)" />
          <circle cx={cx_} cy={80} r={7} fill="var(--surface)" />
        </g>
      ))}
      <path d="M210 62 h12" stroke="var(--brand)" strokeWidth="5" />
    </svg>
  );
}
