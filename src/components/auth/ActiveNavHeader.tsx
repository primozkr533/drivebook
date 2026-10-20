"use client";

import type { ComponentProps } from "react";
import { usePathname } from "next/navigation";
import { AppHeader } from "@/components/ui/Shell";

export function isNavItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

// usePathname is the URL the browser sees (e.g. /_dev/app/account), so hrefs must carry the base path.
export function ActiveNavHeader({ nav = [], ...props }: ComponentProps<typeof AppHeader>) {
  const pathname = usePathname() ?? "";
  return <AppHeader {...props} nav={nav.map((item) => ({ ...item, active: isNavItemActive(pathname, item.href) }))} />;
}
