"use client";

import { useState } from "react";
import { Button } from "@/components/ui";

export function HtmlPreview({ html, showLabel, hideLabel, title }: { html: string; showLabel: string; hideLabel: string; title: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <div>
        <Button variant="secondary" size="sm" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {open ? hideLabel : showLabel}
        </Button>
      </div>
      {/* Empty sandbox: captured HTML may contain scripts and must not run with the app's origin. */}
      {open && <iframe sandbox="" srcDoc={html} title={title} className="h-96 w-full border border-line bg-surface" />}
    </div>
  );
}
