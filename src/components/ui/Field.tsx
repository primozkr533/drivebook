import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";
import { cx } from "@/lib/cx";

const control =
  "w-full h-11 rounded-soft bg-surface px-3.5 text-body text-ink placeholder:text-muted " +
  "shadow-[inset_0_0_0_1px_var(--line)] hover:shadow-[inset_0_0_0_1px_var(--ink-2)] " +
  "focus:outline-none focus:shadow-[inset_0_0_0_2px_var(--ink)] " +
  "aria-[invalid=true]:shadow-[inset_0_0_0_2px_var(--danger)] " +
  "transition-shadow duration-[var(--dur-fast)] disabled:opacity-50";

type FieldShell = { label: string; hint?: ReactNode; error?: ReactNode; prefix?: ReactNode; suffix?: ReactNode };

function Frame({ id, label, hint, error, children }: FieldShell & { id: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="type-utility text-ink">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-msg`} className="text-small text-danger flex items-center gap-1.5">
          <span aria-hidden className="inline-block size-1.5 bg-danger" />
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-msg`} className="text-small text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function Input({
  label,
  hint,
  error,
  prefix,
  suffix,
  className,
  id: idProp,
  ...rest
}: FieldShell & Omit<InputHTMLAttributes<HTMLInputElement>, "prefix">) {
  const auto = useId();
  const id = idProp ?? auto;
  const describedBy = error || hint ? `${id}-msg` : undefined;
  return (
    <Frame id={id} label={label} hint={hint} error={error}>
      <div className="relative flex items-center">
        {prefix && <span className="pointer-events-none absolute left-3.5 text-muted type-utility">{prefix}</span>}
        <input
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cx(control, prefix ? "pl-10" : "", suffix ? "pr-12" : "", className)}
          {...rest}
        />
        {suffix && <span className="pointer-events-none absolute right-3.5 text-muted type-utility">{suffix}</span>}
      </div>
    </Frame>
  );
}

export function Select({
  label,
  hint,
  error,
  children,
  className,
  id: idProp,
  ...rest
}: Omit<FieldShell, "prefix" | "suffix"> & SelectHTMLAttributes<HTMLSelectElement>) {
  const auto = useId();
  const id = idProp ?? auto;
  return (
    <Frame id={id} label={label} hint={hint} error={error}>
      <div className="relative">
        <select id={id} className={cx(control, "appearance-none pr-10", className)} {...rest}>
          {children}
        </select>
        <svg viewBox="0 0 12 12" aria-hidden className="pointer-events-none absolute right-3.5 top-1/2 size-3 -translate-y-1/2 text-ink">
          <path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" />
        </svg>
      </div>
    </Frame>
  );
}

/** Binary toggle rendered as a geometric switch (checkbox semantics). */
export function Switch({
  label,
  hint,
  name,
  defaultChecked,
  ...rest
}: { label: string; hint?: string; name?: string; defaultChecked?: boolean; "data-testid"?: string }) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start justify-between gap-4">
      <span className="flex flex-col gap-0.5">
        <span className="text-body font-[650] text-ink">{label}</span>
        {hint && <span className="text-small text-muted">{hint}</span>}
      </span>
      <span className="relative mt-0.5 shrink-0">
        <input id={id} type="checkbox" name={name} defaultChecked={defaultChecked} className="peer sr-only" {...rest} />
        <span className="block h-6 w-11 rounded-sharp bg-surface-2 shadow-[inset_0_0_0_1.5px_var(--line-strong)] transition-colors duration-[var(--dur-base)] peer-checked:bg-signal peer-focus-visible:shadow-[var(--focus-ring)]" />
        <span className="absolute left-1 top-1 block size-4 bg-ink transition-transform duration-[var(--dur-base)] ease-out peer-checked:translate-x-5" />
      </span>
    </label>
  );
}
