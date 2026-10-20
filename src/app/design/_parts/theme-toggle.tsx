"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

type Mode = "system" | "light" | "dark";
const MODES: { mode: Mode; label: string }[] = [
  { mode: "system", label: "Sistem" },
  { mode: "light", label: "Dan" },
  { mode: "dark", label: "Noč" },
];

export function ThemeToggle() {
  const [mode, setMode] = useState<Mode>("system");

  useEffect(() => {
    const root = document.documentElement;
    if (mode === "system") delete root.dataset.theme;
    else root.dataset.theme = mode;
  }, [mode]);

  return (
    <div role="radiogroup" aria-label="Tema" className="inline-flex border border-line">
      {MODES.map(({ mode: m, label }) => (
        <button
          key={m}
          role="radio"
          aria-checked={mode === m}
          onClick={() => setMode(m)}
          className={cn(
            "h-8 px-3 font-utility text-caption font-medium uppercase tracking-utility transition-colors duration-(--duration-fast)",
            mode === m ? "bg-ink text-ground" : "text-muted hover:text-ink",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
