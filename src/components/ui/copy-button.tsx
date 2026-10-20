"use client";

import { useState, type ReactNode } from "react";
import { Button } from "./button";

/** Copies `value` to the clipboard; label swaps to `copiedLabel` briefly. */
export function CopyButton({
  value,
  label,
  copiedLabel,
  variant = "secondary",
  size = "md",
}: {
  value: string;
  label: ReactNode;
  copiedLabel: ReactNode;
  variant?: "primary" | "secondary" | "quiet";
  size?: "sm" | "md" | "lg";
}) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant={variant}
      size={size}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch {
          /* clipboard unavailable — the value stays visible for manual copy */
        }
      }}
    >
      <span aria-live="polite">{copied ? copiedLabel : label}</span>
    </Button>
  );
}
