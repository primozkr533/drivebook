"use client";

import { usePathname } from "next/navigation";
import { Pill } from "@/components/ui";
import { isNavItemActive } from "@/components/auth/ActiveNavHeader";

// Client-side so the active item follows soft navigation; the settings layout is not re-rendered then.
export function SettingsNav({ label, items }: { label: string; items: { label: string; href: string }[] }) {
  const pathname = usePathname() ?? "";
  return (
    <nav aria-label={label} className="flex flex-wrap gap-2" data-testid="settings-nav">
      {items.map((item) => {
        const active = isNavItemActive(pathname, item.href);
        return (
          <a key={item.href} href={item.href} aria-current={active ? "page" : undefined} className="rounded-pill">
            <Pill active={active}>{item.label}</Pill>
          </a>
        );
      })}
    </nav>
  );
}
