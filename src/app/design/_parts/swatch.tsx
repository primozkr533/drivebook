"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

function toHex(rgb: string) {
  const m = rgb.match(/[\d.]+/g);
  if (!m) return rgb;
  return (
    "#" +
    m
      .slice(0, 3)
      .map((n) => Math.round(Number(n)).toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()
  );
}

/** Reads the resolved token colour from the DOM, so hex values can never drift from tokens.css. */
export function Swatch({ token, name, role, large }: { token: string; name: string; role: string; large?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [hex, setHex] = useState("");

  useEffect(() => {
    const read = () => ref.current && setHex(toHex(getComputedStyle(ref.current).backgroundColor));
    read();
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", read);
    return () => {
      obs.disconnect();
      mq.removeEventListener("change", read);
    };
  }, []);

  return (
    <figure className="flex flex-col gap-3">
      <div
        ref={ref}
        className={cn("border border-line", large ? "h-32 lg:h-40" : "h-20")}
        style={{ backgroundColor: `var(--color-${token})` }}
      />
      <figcaption className="flex flex-col gap-0.5">
        <span className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-semibold text-ink">{name}</span>
          <span className="font-utility text-caption tabular-nums text-muted">{hex || " "}</span>
        </span>
        <span className="font-utility text-caption text-muted">--color-{token}</span>
        <span className="text-xs text-muted">{role}</span>
      </figcaption>
    </figure>
  );
}
