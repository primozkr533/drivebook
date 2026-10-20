"use client";

import { useEffect, useState } from "react";
import { cx } from "@/lib/cx";

type Mode = "system" | "light" | "dark";
const modes: Array<{ id: Mode; label: string }> = [
  { id: "system", label: "Sistem" },
  { id: "light", label: "Svetla" },
  { id: "dark", label: "Temna" },
];

/** Segmented control that sets <html data-theme>. */
export function ThemeToggle() {
  const [mode, setMode] = useState<Mode>("system");
  useEffect(() => {
    const root = document.documentElement;
    if (mode === "system") delete root.dataset.theme;
    else root.dataset.theme = mode;
  }, [mode]);
  return (
    <div role="radiogroup" aria-label="Tema" className="inline-flex h-8 shadow-[inset_0_0_0_1px_var(--line-strong)]">
      {modes.map((m) => (
        <button
          key={m.id}
          role="radio"
          aria-checked={mode === m.id}
          onClick={() => setMode(m.id)}
          className={cx(
            "type-utility px-2.5 transition-colors duration-[var(--dur-fast)]",
            mode === m.id ? "bg-ink text-ground" : "text-ink-2 hover:text-ink",
          )}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
