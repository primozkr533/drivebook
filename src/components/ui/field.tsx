import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "@/lib/cn";

/* Field = label + control + hint/error. Strings come in as props (next-intl). */

type FieldProps = {
  label: ReactNode;
  htmlFor: string;
  hint?: ReactNode;
  error?: ReactNode;
  /** e.g. t("common.optional") */
  optionalLabel?: ReactNode;
  className?: string;
  children: ReactNode;
};

export function Field({ label, htmlFor, hint, error, optionalLabel, className, children }: FieldProps) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <label
        htmlFor={htmlFor}
        className="flex items-baseline justify-between gap-4 font-utility text-caption font-medium uppercase tracking-utility text-ink"
      >
        <span>{label}</span>
        {optionalLabel && <span className="text-muted">{optionalLabel}</span>}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="text-sm text-negative">
          {error}
        </p>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

const control =
  "w-full rounded-hair border border-line bg-surface text-base text-ink placeholder:text-muted " +
  "transition-[border-color,box-shadow] duration-(--duration-base) ease-out " +
  "hover:border-ink-soft focus-visible:border-rule focus-visible:outline-none " +
  "focus-visible:shadow-[0_0_0_var(--rule-heavy)_var(--color-focus)] " +
  "aria-[invalid=true]:border-negative disabled:bg-sunken disabled:text-muted";

type InputProps = ComponentPropsWithoutRef<"input"> & {
  /** Unit or prefix shown inside the control: "€", "min", "dni". */
  suffix?: ReactNode;
  prefix?: ReactNode;
  invalid?: boolean;
};

export function Input({ suffix, prefix, invalid, className, ...props }: InputProps) {
  const input = (
    <input
      aria-invalid={invalid || undefined}
      className={cn(control, "h-11 px-3 read-only:bg-sunken", prefix && "pl-9", suffix && "pr-14", className)}
      {...props}
    />
  );
  if (!suffix && !prefix) return input;
  return (
    <div className="relative">
      {prefix && (
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center font-utility text-sm text-muted">
          {prefix}
        </span>
      )}
      {input}
      {suffix && (
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center font-utility text-caption uppercase tracking-utility text-muted">
          {suffix}
        </span>
      )}
    </div>
  );
}

export function Textarea({ invalid, className, ...props }: ComponentPropsWithoutRef<"textarea"> & { invalid?: boolean }) {
  return (
    <textarea aria-invalid={invalid || undefined} className={cn(control, "min-h-28 px-3 py-2.5", className)} {...props} />
  );
}

export function Select({ invalid, className, ...props }: ComponentPropsWithoutRef<"select"> & { invalid?: boolean }) {
  return (
    <select
      aria-invalid={invalid || undefined}
      className={cn(
        control,
        "h-11 appearance-none bg-[length:10px] bg-[right_0.9rem_center] bg-no-repeat px-3 pr-9",
        "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%235a5f71' stroke-width='1.4'/%3E%3C/svg%3E\")]",
        className,
      )}
      {...props}
    />
  );
}
