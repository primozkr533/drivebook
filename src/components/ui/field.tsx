import type { InputHTMLAttributes, LabelHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const control = [
  "w-full rounded-sm border border-line-strong bg-surface-raised px-3 text-body text-ink",
  "placeholder:text-faint shadow-[inset_0_1px_0_var(--surface-sunk)]",
  "transition-[border-color,box-shadow] duration-[var(--motion-fast)] ease-out",
  "hover:border-ink-soft",
  "focus:outline-none focus:border-primary focus:shadow-[0_0_0_3px_var(--primary-soft)]",
  "disabled:bg-surface-sunk disabled:text-faint",
  "aria-[invalid=true]:border-danger aria-[invalid=true]:focus:shadow-[0_0_0_3px_var(--danger-soft)]",
].join(" ");

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-small font-semibold text-ink", className)} {...props} />;
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(control, "h-10", className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(control, "min-h-24 py-2 leading-body", className)} {...props} />;
}

/**
 * Label + control + hint/error, wired for a11y. Pass the control as children
 * and give it the same `id`; Field sets aria-describedby via the ids it renders.
 */
export function Field({
  id,
  label,
  hint,
  error,
  optionalLabel,
  className,
  children,
}: {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  /** Already-translated "optional" marker, e.g. t("common.optional"). */
  optionalLabel?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <Label htmlFor={id}>{label}</Label>
        {optionalLabel ? (
          <span className="font-mono text-micro uppercase tracking-utility text-faint">{optionalLabel}</span>
        ) : null}
      </div>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-caption font-medium text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-caption text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
