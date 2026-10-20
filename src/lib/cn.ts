import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Teach tailwind-merge our custom token names so e.g. `text-caption` (size)
// and `text-muted` (colour) are not treated as conflicting classes.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["caption", "xs", "sm", "base", "md", "lg", "xl", "2xl", "3xl", "display"],
      radius: ["none", "hair", "soft", "pill"],
      shadow: ["raise", "overlay"],
      tracking: ["display", "tight", "normal", "utility"],
      leading: ["none", "tight", "snug", "normal", "body"],
      spacing: ["gutter", "section"],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
