"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cx } from "@/lib/cx";
import { Button } from "./Button";
import type { NavItem } from "./Shell";

/** Disclosure menu for AppHeader below `lg`; render it through `AppHeader menu={…}`. */
export function CompactMenu({
  label,
  nav,
  footer,
  className,
}: {
  label: string;
  nav: NavItem[];
  footer?: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape" || !open) return;
    setOpen(false);
    buttonRef.current?.focus();
  };

  return (
    <div className={cx("lg:hidden", className)} onKeyDown={onKeyDown}>
      <Button
        ref={buttonRef}
        variant="secondary"
        size="sm"
        aria-expanded={open}
        aria-controls={panelId}
        data-testid="compact-menu-button"
        onClick={() => setOpen((value) => !value)}
        icon={
          <svg viewBox="0 0 16 16" aria-hidden className="size-4">
            {open ? (
              <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="2" />
            ) : (
              <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="2" />
            )}
          </svg>
        }
      >
        {label}
      </Button>
      <div
        id={panelId}
        hidden={!open}
        data-testid="compact-menu-panel"
        className="absolute inset-x-0 top-full border-b border-line-strong bg-ground shadow-float"
      >
        <nav aria-label={label} className="mx-auto flex w-full max-w-page flex-col py-2">
          {nav.map((item) => (
            <a
              key={item.href}
              href={item.href}
              aria-current={item.active ? "page" : undefined}
              onClick={() => setOpen(false)}
              className={cx(
                "px-[var(--gutter)] py-3 text-body font-[600] text-ink-2 hover:text-ink",
                item.active && "text-ink shadow-[inset_3px_0_0_var(--signal)]",
              )}
            >
              {item.label}
            </a>
          ))}
        </nav>
        {footer && (
          <div className="mx-auto flex w-full max-w-page flex-col gap-1 border-t border-dashed border-line px-[var(--gutter)] py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
