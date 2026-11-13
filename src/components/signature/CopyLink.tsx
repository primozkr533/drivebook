"use client";

import { useState } from "react";
import { cx } from "@/lib/cx";

/** Deep link with copy button — shows the exact URL a dealer pastes into avto.net / chats. */
export function CopyLink({ url, label = "Kopiraj", copiedLabel = "Kopirano" }: { url: string; label?: string; copiedLabel?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex h-9 w-full items-stretch bg-surface-2 text-small">
      <code className="flex min-w-0 flex-1 items-center truncate px-3 font-mono text-code text-ink-2">{url}</code>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(/^https?:\/\//.test(url) ? url : `https://${url}`);
          } catch {
            /* clipboard unavailable — the URL stays selectable */
          }
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        }}
        className={cx(
          "type-utility shrink-0 px-3 transition-colors duration-[var(--dur-fast)]",
          copied ? "bg-ok text-surface" : "bg-ink text-ground hover:bg-signal hover:text-on-signal",
        )}
      >
        {copied ? copiedLabel : label}
      </button>
    </div>
  );
}
