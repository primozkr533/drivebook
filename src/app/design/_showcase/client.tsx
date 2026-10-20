"use client";

import { useEffect, useRef, useState } from "react";

/** Swatch that reads its value live from tokens.css — the hex shown is what's actually rendered. */
export function Swatch({ token, name, note }: { token: string; name: string; note?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState("");

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => setValue(getComputedStyle(el).getPropertyValue(token).trim());
    read();
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, [token]);

  return (
    <div ref={ref} className="flex min-w-0 items-center gap-3">
      <span
        className="size-11 shrink-0 rounded-sm border border-line"
        style={{ background: `var(${token})` }}
      />
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-small font-semibold text-ink">{name}</span>
        <span className="truncate font-mono text-micro uppercase tracking-utility text-muted">
          {token} · {value || "…"}
        </span>
        {note ? <span className="truncate text-caption text-muted">{note}</span> : null}
      </span>
    </div>
  );
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
  }, []);

  function set(next: "light" | "dark") {
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("db-theme", next);
    } catch {}
    setTheme(next);
  }

  return (
    <div role="group" aria-label="Theme" className="inline-flex rounded-sm border border-line-strong bg-surface-raised p-0.5">
      {(["light", "dark"] as const).map((v) => (
        <button
          key={v}
          type="button"
          aria-pressed={theme === v}
          onClick={() => set(v)}
          className="h-7 rounded-xs px-3 font-mono text-micro font-medium uppercase tracking-utility text-muted transition-colors duration-[var(--motion-fast)] aria-pressed:bg-ink aria-pressed:text-surface"
        >
          {v}
        </button>
      ))}
    </div>
  );
}
