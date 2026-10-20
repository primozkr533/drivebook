"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";

/** Read-only URL with a copy button — car deep links, dealer page link. */
export function CopyLink({ url, label, className }: { url: string; label?: string; className?: string }) {
  const t = useTranslations("common");
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — the URL is still selectable */
    }
  }

  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      {label ? (
        <span className="font-mono text-micro font-medium uppercase tracking-utility text-muted">{label}</span>
      ) : null}
      <div className="flex min-w-0 items-stretch rounded-sm border border-line bg-surface-sunk">
        <code className="min-w-0 flex-1 truncate px-2.5 py-1.5 font-mono text-caption text-ink-soft select-all">
          {url}
        </code>
        <button
          type="button"
          onClick={copy}
          aria-live="polite"
          className={cn(
            "shrink-0 border-l border-line px-3 font-mono text-micro font-medium uppercase tracking-utility",
            "transition-colors duration-[var(--motion-fast)]",
            copied ? "bg-primary-soft text-primary-strong" : "text-ink hover:bg-surface-raised",
          )}
        >
          {copied ? `✓ ${t("copied")}` : t("copy")}
        </button>
      </div>
    </div>
  );
}
